import { supabase } from './config.js';

// Converte "joao.silva" -> "joao.silva@techgym.local" (mantém e-mail se já tiver @)
export function normalizeUsernameToEmail(rawInput) {
  const clean = rawInput.trim().toLowerCase().replace(/\s+/g, '');
  if (clean.includes('@')) return clean;
  return `${clean}@techgym.local`;
}

// Normaliza CPF (remove pontos e traços) ou mantém senha customizada do admin
export function normalizeCpfPassword(rawPass) {
  const digitsOnly = rawPass.replace(/\D/g, '');
  return digitsOnly.length === 11 ? digitsOnly : rawPass.trim();
}

const loginForm = document.getElementById('login-form');
const errorBox = document.getElementById('auth-error');
const loginBtn = document.getElementById('login-btn');

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (errorBox) errorBox.style.display = 'none';

    const rawUser = document.getElementById('username').value;
    const rawPass = document.getElementById('password').value;

    const email = normalizeUsernameToEmail(rawUser);
    const password = normalizeCpfPassword(rawPass);

    if (loginBtn) {
      loginBtn.disabled = true;
      loginBtn.textContent = 'Entrando...';
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Entrar no Sistema';
      }
      if (errorBox) {
        errorBox.textContent = 'Usuário ou CPF incorretos. Verifique os dados e tente novamente.';
        errorBox.style.display = 'block';
      }
      return;
    }

    await redirectByRole(data.user.id);
  });
}

async function redirectByRole(userId) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    if (errorBox) {
      errorBox.textContent = 'Perfil não encontrado. Procure a recepção da Techgym.';
      errorBox.style.display = 'block';
    }
    return;
  }

  window.location.href = profile.role === 'admin' ? './admin.html' : './aluno.html';
}

export async function checkAuth(requiredRole) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = './index.html';
    return null;
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (error || !profile || (requiredRole && profile.role !== requiredRole)) {
    window.location.href = './index.html';
    return null;
  }

  return { session, profile };
}

export async function logout() {
  await supabase.auth.signOut();
  window.location.href = './index.html';
}