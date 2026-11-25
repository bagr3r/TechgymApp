export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function showToast(title, message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `techgym-toast ${type}`;
  toast.innerHTML = `
    <div class="techgym-toast-body">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.2s ease';
    setTimeout(() => toast.remove(), 220);
  }, 4000);
}

export function showConfirmDialog(title, text) {
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

export function setFieldError(inputId, errorElId, message) {
  const input = document.getElementById(inputId);
  const errEl = document.getElementById(errorElId);
  if (input) input.classList.add('input-error');
  if (errEl) errEl.textContent = message;
}

export function clearFieldError(inputId, errorElId) {
  const input = document.getElementById(inputId);
  const errEl = document.getElementById(errorElId);
  if (input) input.classList.remove('input-error');
  if (errEl) errEl.textContent = '';
}

export function clearFormErrors(pairs) {
  pairs.forEach(([inputId, errId]) => clearFieldError(inputId, errId));
}

export function bindLiveErrorClearing(pairs) {
  pairs.forEach(([inputId, errId]) => {
    document.getElementById(inputId)?.addEventListener('input', () => clearFieldError(inputId, errId));
  });
}

export function formatCpfMask(value) {
  return value
    .replace(/\D/g, '')
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

export function isValidCPF(rawCpf) {
  const cpf = rawCpf.replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf.charAt(i), 10) * (10 - i);
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cpf.charAt(9), 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf.charAt(i), 10) * (11 - i);
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  return rev === parseInt(cpf.charAt(10), 10);
}

export function sanitizeUsername(raw) {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._-]/g, '');
}

export function isValidYoutubeUrl(url) {
  if (!url) return true;
  try {
    const parsed = new URL(url.trim());
    const validProtocol = parsed.protocol === 'https:' || parsed.protocol === 'http:';
    const validHost = /^(www\.)?(youtube\.com|youtu\.be)$/i.test(parsed.hostname);
    return validProtocol && validHost;
  } catch {
    return false;
  }
}

const sessionAuditLogs = [];

export function initAuditLogUI() {
  const toggleBtn = document.getElementById('audit-log-toggle');
  const popover = document.getElementById('audit-log-popover');
  const clearBtn = document.getElementById('audit-log-clear');

  toggleBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!popover) return;
    popover.style.display = popover.style.display === 'none' ? 'block' : 'none';
  });

  clearBtn?.addEventListener('click', () => {
    sessionAuditLogs.length = 0;
    renderAuditLogs();
  });

  document.addEventListener('click', (e) => {
    if (popover && popover.style.display === 'block' && !popover.contains(e.target) && e.target !== toggleBtn) {
      popover.style.display = 'none';
    }
  });
}

export function recordAuditLog({ where, what, before, after }) {
  const now = new Date();
  const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  sessionAuditLogs.unshift({ where, what, before, after, time });
  if (sessionAuditLogs.length > 30) sessionAuditLogs.pop();

  renderAuditLogs();
}

function renderAuditLogs() {
  const countEl = document.getElementById('audit-log-count');
  const listEl = document.getElementById('audit-log-list');
  if (countEl) countEl.textContent = String(sessionAuditLogs.length);
  if (!listEl) return;

  if (!sessionAuditLogs.length) {
    listEl.innerHTML = '<div class="empty-state" style="padding: 18px 10px;">Nenhuma alteração registrada nesta sessão.</div>';
    return;
  }

  listEl.innerHTML = sessionAuditLogs.map(entry => `
    <div class="audit-entry">
      <div class="audit-entry-top">
        <span class="audit-entry-where">${escapeHtml(entry.where)}</span>
        <span class="audit-entry-time">${escapeHtml(entry.time)}</span>
      </div>
      <div class="audit-entry-what">${escapeHtml(entry.what)}</div>
      <div class="audit-diff-row">
        <span class="audit-before">${escapeHtml(entry.before || 'Vazio')}</span>
        <span>→</span>
        <span class="audit-after">${escapeHtml(entry.after || 'Removido')}</span>
      </div>
    </div>
  `).join('');
}