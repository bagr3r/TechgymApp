// js/auth.js
import { supabase } from './config.js';

const loginForm = document.getElementById('login-form');
const errorMsg = document.getElementById('login-error');
const btnLogin = document.getElementById('btn-login');

// Redireciona automaticamente se já houver sessão ativa
async function checkExistingSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    await redirectByRole(session.user.id);
  }
}

async function redirectByRole(userId) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role, active')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    errorMsg.textContent = 'Perfil não encontrado. Procure a recepção.';
    await supabase.auth.signOut();
    return;
  }

  if (!profile.active) {
    errorMsg.textContent = 'Cadastro inativo. Fale com a recepção da academia.';
    await supabase.auth.signOut();
    return;
  }

  if (profile.role === 'admin') {
    window.location.href = './admin.html';
  } else {
    window.location.href = './aluno.html';
  }
}

if (loginForm) {
  checkExistingSession();

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMsg.textContent = '';
    btnLogin.disabled = true;
    btnLogin.textContent = 'Entrando...';

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      errorMsg.textContent = 'E-mail ou senha incorretos.';
      btnLogin.disabled = false;
      btnLogin.textContent = 'Entrar';
      return;
    }

    await redirectByRole(data.user.id);
  });
}

// Função reutilizável de logout para aluno.html e admin.html
export async function logout() {
  await supabase.auth.signOut();
  localStorage.removeItem('techgym_workout_cache');
  window.location.href = './index.html';
}