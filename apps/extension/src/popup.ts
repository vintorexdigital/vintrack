const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
interface View { signedIn: boolean; state: { status: string; reason: string; lastSite: string | null; sentToday: number }; queued: number }

function render(v: View) {
  $('signin').hidden = v.signedIn;
  $('status').hidden = !v.signedIn;
  if (!v.signedIn) return;
  $('state').textContent = v.state.status === 'recording' ? '● Recording' : v.state.status === 'off' ? 'Switched off by your company' : 'Not recording';
  $('reason').textContent = v.state.reason;
  $('last').textContent = v.state.lastSite ?? '–';
  $('sent').textContent = String(v.state.sentToday);
  $('queued').textContent = String(v.queued);
}
const ask = <T>(msg: Record<string, unknown>): Promise<T> => chrome.runtime.sendMessage(msg) as Promise<T>;

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('error').textContent = '';
  const r = await ask<{ ok: boolean; message?: string }>({ type: 'sign-in', tenant: $<HTMLInputElement>('tenant').value.trim(), identifier: $<HTMLInputElement>('identifier').value.trim(), password: $<HTMLInputElement>('password').value });
  if (!r.ok) $('error').textContent = r.message ?? 'Could not sign in.';
  else { $<HTMLInputElement>('password').value = ''; render(await ask<View>({ type: 'state' })); }
});
$('signout').addEventListener('click', async () => { await ask({ type: 'sign-out' }); render(await ask<View>({ type: 'state' })); });
void ask<View>({ type: 'refresh' }).then(render);
