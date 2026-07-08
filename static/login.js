/* CardForge SDD — Login / Register Page Logic */

document.addEventListener('DOMContentLoaded', async () => {
  const user = await checkAuth();
  if (user) { redirectByRole(user); return; }

  showLogin();

  document.getElementById('btn-login').addEventListener('click', onLogin);
  document.getElementById('login-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') onLogin();
  });
  document.getElementById('btn-register').addEventListener('click', onRegister);
  document.getElementById('reg-confirm').addEventListener('keydown', e => {
    if (e.key === 'Enter') onRegister();
  });
  document.getElementById('link-register').addEventListener('click', e => { e.preventDefault(); showRegister(); });
  document.getElementById('link-login').addEventListener('click', e => { e.preventDefault(); showLogin(); });

  // Clear errors on input
  ['login-username', 'login-password', 'reg-username', 'reg-display', 'reg-password', 'reg-confirm'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      document.getElementById(id).closest('.field').classList.remove('field--error');
      document.getElementById('error').textContent = '';
    });
  });
});

function showLogin() {
  document.getElementById('login-form').classList.remove('hidden');
  document.getElementById('register-form').classList.add('hidden');
  document.getElementById('auth-subtitle').textContent = '数据驱动卡牌游戏管理后台';
  document.getElementById('error').textContent = '';
  document.querySelectorAll('.field--error').forEach(el => el.classList.remove('field--error'));
}

function showRegister() {
  document.getElementById('login-form').classList.add('hidden');
  document.getElementById('register-form').classList.remove('hidden');
  document.getElementById('auth-subtitle').textContent = '创建你的玩家账号';
  document.getElementById('error').textContent = '';
  document.querySelectorAll('.field--error').forEach(el => el.classList.remove('field--error'));
}

function setFieldError(id, msg) {
  document.getElementById(id).closest('.field').classList.add('field--error');
  document.getElementById('error').textContent = '✕ ' + msg;
}

function setButtonBusy(btn, busy) {
  btn.disabled = busy;
  btn.setAttribute('aria-busy', busy ? 'true' : 'false');
  if (busy) {
    btn.dataset.originalText = btn.textContent;
    btn.textContent = btn.id === 'btn-login' ? '登录中...' : '注册中...';
  } else {
    btn.textContent = btn.dataset.originalText || (btn.id === 'btn-login' ? '登 录' : '注 册');
  }
}

async function onLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('error');
  const btn = document.getElementById('btn-login');

  document.querySelectorAll('.field--error').forEach(el => el.classList.remove('field--error'));
  errorEl.textContent = '';

  let hasError = false;
  if (!username) { setFieldError('login-username', '请输入用户名'); hasError = true; }
  if (!password) { setFieldError('login-password', '请输入密码'); hasError = true; }
  if (hasError) return;

  setButtonBusy(btn, true);
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFieldError('login-username', data.detail || '登录失败');
      setFieldError('login-password', '');
      return;
    }
    saveSession(data);
    redirectByRole(data);
  } catch (err) {
    errorEl.textContent = '✕ 网络错误: ' + err.message;
  } finally {
    setButtonBusy(btn, false);
  }
}

async function onRegister() {
  const username = document.getElementById('reg-username').value.trim();
  const displayName = document.getElementById('reg-display').value.trim();
  const password = document.getElementById('reg-password').value;
  const confirm = document.getElementById('reg-confirm').value;
  const errorEl = document.getElementById('error');
  const btn = document.getElementById('btn-register');

  document.querySelectorAll('.field--error').forEach(el => el.classList.remove('field--error'));
  errorEl.textContent = '';

  let hasError = false;
  if (!username) { setFieldError('reg-username', '请输入用户名'); hasError = true; }
  if (!password) { setFieldError('reg-password', '请输入密码'); hasError = true; }
  else if (password.length < 6) { setFieldError('reg-password', '密码至少 6 位'); hasError = true; }
  if (password !== confirm) { setFieldError('reg-confirm', '两次输入的密码不一致'); hasError = true; }
  if (hasError) return;

  setButtonBusy(btn, true);
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, displayName }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFieldError('reg-username', data.detail || '注册失败');
      return;
    }
    saveSession(data);
    redirectByRole(data);
  } catch (err) {
    errorEl.textContent = '✕ 网络错误: ' + err.message;
  } finally {
    setButtonBusy(btn, false);
  }
}

function saveSession(data) {
  localStorage.setItem('cf_token', data.token);
  localStorage.setItem('cf_user', JSON.stringify({ id: data.id, username: data.username, role: data.role, displayName: data.displayName }));
}
