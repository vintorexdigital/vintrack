const $ = (id) => document.getElementById(id);
const hm = (m) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;

function render(v) {
  $('signin').hidden = v.signedIn;
  $('status').hidden = !v.signedIn;
  if (!v.signedIn) return;
  const a = v.agent;
  $('state').textContent = a.status === 'recording' ? '● Recording' : a.status === 'off' ? 'Switched off by your company' : 'Not recording';
  $('state').style.color = a.status === 'recording' ? 'var(--live)' : '';
  $('reason').textContent = a.reason;
  $('recorded').textContent = hm(a.today.recordedMinutes);
  $('idle').textContent = hm(a.today.idleMinutes);
  $('last').textContent = a.lastApp || '–';
  $('queued').textContent = String(a.queued);
  const p = a.policy;
  const items = p ? [
    'Which application is in front, and for how long',
    p.windowTitles === 'drop' ? 'Window titles: not collected' : p.windowTitles === 'hash' ? 'Window titles: scrambled so they cannot be read' : 'Window titles: collected',
    p.fullUrls ? 'Websites: full addresses' : 'Websites: only the site name (for example github.com)',
    'Whether you were using the keyboard or mouse (never what you typed)',
    p.screenshots ? 'Screenshots: on' : 'Screenshots: never',
    'Only between punch in and punch out',
  ] : ['Waiting for your company’s settings'];
  $('policy').replaceChildren(...items.map((t) => Object.assign(document.createElement('li'), { textContent: t })));
}

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('error').textContent = '';
  const r = await window.trackrex.signIn({ tenant: $('tenant').value.trim(), identifier: $('identifier').value.trim(), password: $('password').value });
  if (!r.ok) $('error').textContent = r.message || 'Could not sign in.';
  else $('password').value = '';
});
$('signout').addEventListener('click', () => window.trackrex.signOut());
window.trackrex.onState(render);
window.trackrex.state().then(render);
