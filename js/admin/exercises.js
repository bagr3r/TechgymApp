import { supabase } from '../config.js';
import {
  escapeHtml, showToast, showConfirmDialog,
  setFieldError, clearFieldError, clearFormErrors, isValidYoutubeUrl
} from './ui.js';

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

export function createExercisesManager(state, callbacks) {
  const exerciseForm = document.getElementById('exercise-form');
  const needsAccessoryCheckbox = document.getElementById('exercise-needs-accessory');
  const accessoryWrapper = document.getElementById('exercise-accessory-wrapper');
  const accessoryTextInput = document.getElementById('exercise-accessory-text');
  const globalSearchInput = document.getElementById('exercises-table-search');
  const groupedContainer = document.getElementById('exercises-grouped-container');

  const editModal = document.getElementById('edit-exercise-modal');
  const editForm = document.getElementById('edit-exercise-form');
  const editNeedsCheckbox = document.getElementById('edit-exercise-needs-accessory');
  const editAccessoryWrapper = document.getElementById('edit-exercise-accessory-wrapper');
  const editAccessoryText = document.getElementById('edit-exercise-accessory-text');

  let globalSearchTerm = '';
  let perGroupTerms = {};

  window.closeExerciseModal = () => {
    if (editModal) editModal.style.display = 'none';
  };

  function renderGroupedExercises() {
    if (!groupedContainer) return;
    const globalTerm = globalSearchTerm.trim().toLowerCase();
    const filteredGlobal = state.allExercises.filter(ex =>
      !globalTerm ||
      String(ex.machine_number).toLowerCase().includes(globalTerm) ||
      ex.name.toLowerCase().includes(globalTerm) ||
      (ex.muscle_group && ex.muscle_group.toLowerCase().includes(globalTerm))
    );

    if (!filteredGlobal.length) {
      groupedContainer.innerHTML = '<div class="empty-state">Nenhum aparelho encontrado.</div>';
      return;
    }

    const grouped = {};
    filteredGlobal.forEach(ex => {
      const cat = normalizeMuscleCategory(ex.muscle_group);
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(ex);
    });

    const categories = [...MUSCLE_GROUPS_ORDER, 'Outros'].filter(c => grouped[c]?.length > 0);

    groupedContainer.innerHTML = categories.map(cat => {
      const allInCat = grouped[cat];
      const groupTerm = (perGroupTerms[cat] || '').trim().toLowerCase();
      const visible = allInCat.filter(ex =>
        !groupTerm ||
        String(ex.machine_number).toLowerCase().includes(groupTerm) ||
        ex.name.toLowerCase().includes(groupTerm) ||
        (ex.equipment_notes && ex.equipment_notes.toLowerCase().includes(groupTerm))
      );

      return `
        <div class="muscle-group-card">
          <div class="muscle-group-header">
            <h4><span class="muscle-group-dot"></span> ${escapeHtml(cat)}</h4>
            <span class="badge badge-red">${allInCat.length} ${allInCat.length === 1 ? 'aparelho' : 'aparelhos'}</span>
          </div>
          <div class="muscle-group-search-bar">
            <input type="search" data-group-search="${escapeHtml(cat)}"
                   placeholder="Filtrar em ${escapeHtml(cat)}..."
                   value="${escapeHtml(perGroupTerms[cat] || '')}">
          </div>
          <div class="table-wrapper" style="border: none; border-radius: 0;">
            <table>
              <thead>
                <tr>
                  <th style="width: 130px;">Nº Máquina</th>
                  <th>Exercício &amp; Acessório</th>
                  <th style="width: 130px;">Vídeo</th>
                  <th style="width: 170px;">Ações</th>
                </tr>
              </thead>
              <tbody>
                ${visible.length ? visible.map(ex => `
                  <tr>
                    <td><span class="badge badge-dark">Máq. #${escapeHtml(ex.machine_number)}</span></td>
                    <td>
                      <strong>${escapeHtml(ex.name)}</strong>
                      ${ex.equipment_notes ? `<div style="margin-top:4px;"><span class="badge badge-red">Requer: ${escapeHtml(ex.equipment_notes)}</span></div>` : ''}
                    </td>
                    <td>
                      ${ex.video_url
                        ? `<a href="${escapeHtml(ex.video_url)}" target="_blank" rel="noopener noreferrer" class="badge badge-red">Ver Vídeo</a>`
                        : '<span style="color: var(--text-secondary); font-size: 0.8rem;">Sem vídeo</span>'}
                    </td>
                    <td class="actions-cell">
                      <button type="button" class="btn-sm btn-outline" data-edit-ex="${ex.id}">Editar</button>
                      <button type="button" class="btn-sm btn-danger" data-del-ex="${ex.id}">Excluir</button>
                    </td>
                  </tr>
                `).join('') : `<tr><td colspan="4" class="empty-state">Nenhum aparelho encontrado em ${escapeHtml(cat)}.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }).join('');
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

    state.allExercises = data || [];
    callbacks.onExercisesChanged();
    renderGroupedExercises();
  }

  groupedContainer?.addEventListener('input', (e) => {
    const groupCat = e.target.dataset.groupSearch;
    if (!groupCat) return;
    perGroupTerms[groupCat] = e.target.value;
    renderGroupedExercises();
    const reopened = groupedContainer.querySelector(`[data-group-search="${CSS.escape(groupCat)}"]`);
    if (reopened) {
      reopened.focus();
      reopened.setSelectionRange(reopened.value.length, reopened.value.length);
    }
  });

  groupedContainer?.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-edit-ex]');
    if (editBtn) {
      const ex = state.allExercises.find(item => String(item.id) === String(editBtn.dataset.editEx));
      if (!ex || !editModal) return;

      clearFormErrors([
        ['edit-exercise-machine', 'err-edit-exercise-machine'],
        ['edit-exercise-name', 'err-edit-exercise-name'],
        ['edit-exercise-video', 'err-edit-exercise-video'],
        ['edit-exercise-accessory-text', 'err-edit-exercise-accessory']
      ]);
      document.getElementById('edit-exercise-id').value = ex.id;
      document.getElementById('edit-exercise-machine').value = ex.machine_number || '';
      document.getElementById('edit-exercise-name').value = ex.name || '';
      document.getElementById('edit-exercise-muscle').value = normalizeMuscleCategory(ex.muscle_group);
      document.getElementById('edit-exercise-video').value = ex.video_url || '';

      const hasNotes = Boolean(ex.equipment_notes);
      if (editNeedsCheckbox) editNeedsCheckbox.checked = hasNotes;
      if (editAccessoryWrapper) editAccessoryWrapper.style.display = hasNotes ? 'flex' : 'none';
      if (editAccessoryText) editAccessoryText.value = ex.equipment_notes || '';

      editModal.style.display = 'flex';
      return;
    }

    const delBtn = e.target.closest('[data-del-ex]');
    if (delBtn) {
      const ex = state.allExercises.find(item => String(item.id) === String(delBtn.dataset.delEx));
      if (!ex) return;

      const ok = await showConfirmDialog('Excluir Aparelho?', `Deseja remover "${ex.name}" do catálogo?`);
      if (!ok) return;

      const { error } = await supabase.from('exercises').delete().eq('id', ex.id);
      if (error) {
        showToast('Erro ao Excluir', error.message, 'error');
        return;
      }
      showToast('Aparelho Removido', `${ex.name} excluído.`, 'success');
      await loadExercises();
    }
  });

  needsAccessoryCheckbox?.addEventListener('change', () => {
    if (!accessoryWrapper) return;
    accessoryWrapper.style.display = needsAccessoryCheckbox.checked ? 'flex' : 'none';
    if (needsAccessoryCheckbox.checked) accessoryTextInput?.focus();
    else if (accessoryTextInput) {
      accessoryTextInput.value = '';
      clearFieldError('exercise-accessory-text', 'err-exercise-accessory');
    }
  });

  editNeedsCheckbox?.addEventListener('change', () => {
    if (!editAccessoryWrapper) return;
    editAccessoryWrapper.style.display = editNeedsCheckbox.checked ? 'flex' : 'none';
    if (editNeedsCheckbox.checked) editAccessoryText?.focus();
    else if (editAccessoryText) {
      editAccessoryText.value = '';
      clearFieldError('edit-exercise-accessory-text', 'err-edit-exercise-accessory');
    }
  });

  globalSearchInput?.addEventListener('input', (e) => {
    globalSearchTerm = e.target.value;
    renderGroupedExercises();
  });

  exerciseForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors([
      ['exercise-machine', 'err-exercise-machine'],
      ['exercise-name', 'err-exercise-name'],
      ['exercise-video', 'err-exercise-video'],
      ['exercise-accessory-text', 'err-exercise-accessory']
    ]);

    const machineNumber = document.getElementById('exercise-machine').value.trim().toUpperCase();
    const name = document.getElementById('exercise-name').value.trim();
    const muscleGroup = document.getElementById('exercise-muscle').value;
    const videoUrl = document.getElementById('exercise-video').value.trim();
    const needsAcc = needsAccessoryCheckbox?.checked || false;
    const equipmentNotes = needsAcc ? (accessoryTextInput?.value.trim() || '') : null;

    let hasError = false;
    if (!machineNumber) { setFieldError('exercise-machine', 'err-exercise-machine', 'Informe o nº da máquina.'); hasError = true; }
    if (name.length < 3) { setFieldError('exercise-name', 'err-exercise-name', 'Mínimo 3 letras.'); hasError = true; }
    if (!isValidYoutubeUrl(videoUrl)) { setFieldError('exercise-video', 'err-exercise-video', 'Link do YouTube inválido.'); hasError = true; }
    if (needsAcc && equipmentNotes.length < 2) { setFieldError('exercise-accessory-text', 'err-exercise-accessory', 'Descreva o acessório.'); hasError = true; }
    if (hasError) return;

    const submitBtn = exerciseForm.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Salvando...'; }

    const { error } = await supabase.from('exercises').insert([{
      machine_number: machineNumber,
      name,
      muscle_group: muscleGroup,
      video_url: videoUrl || null,
      equipment_notes: equipmentNotes || null
    }]);

    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Salvar Aparelho / Exercício'; }
    if (error) { showToast('Erro ao Salvar', error.message, 'error'); return; }

    exerciseForm.reset();
    if (accessoryWrapper) accessoryWrapper.style.display = 'none';
    showToast('Aparelho Cadastrado!', `Máq. #${machineNumber} — ${name} salvo.`, 'success');
    await loadExercises();
  });

  editForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors([
      ['edit-exercise-machine', 'err-edit-exercise-machine'],
      ['edit-exercise-name', 'err-edit-exercise-name'],
      ['edit-exercise-video', 'err-edit-exercise-video'],
      ['edit-exercise-accessory-text', 'err-edit-exercise-accessory']
    ]);

    const id = document.getElementById('edit-exercise-id').value;
    const machineNumber = document.getElementById('edit-exercise-machine').value.trim().toUpperCase();
    const name = document.getElementById('edit-exercise-name').value.trim();
    const muscleGroup = document.getElementById('edit-exercise-muscle').value;
    const videoUrl = document.getElementById('edit-exercise-video').value.trim();
    const needsAcc = editNeedsCheckbox?.checked || false;
    const equipmentNotes = needsAcc ? (editAccessoryText?.value.trim() || '') : null;

    let hasError = false;
    if (!machineNumber) { setFieldError('edit-exercise-machine', 'err-edit-exercise-machine', 'Informe o nº do aparelho.'); hasError = true; }
    if (name.length < 3) { setFieldError('edit-exercise-name', 'err-edit-exercise-name', 'Mínimo 3 letras.'); hasError = true; }
    if (!isValidYoutubeUrl(videoUrl)) { setFieldError('edit-exercise-video', 'err-edit-exercise-video', 'Link inválido.'); hasError = true; }
    if (needsAcc && equipmentNotes.length < 2) { setFieldError('edit-exercise-accessory-text', 'err-edit-exercise-accessory', 'Descreva o acessório.'); hasError = true; }
    if (hasError) return;

    const { error } = await supabase
      .from('exercises')
      .update({
        machine_number: machineNumber,
        name,
        muscle_group: muscleGroup,
        video_url: videoUrl || null,
        equipment_notes: equipmentNotes || null
      })
      .eq('id', id);

    if (error) { showToast('Erro ao Atualizar', error.message, 'error'); return; }

    window.closeExerciseModal();
    showToast('Aparelho Atualizado!', 'Alterações salvas.', 'success');
    await loadExercises();
  });

  return { loadExercises };
}