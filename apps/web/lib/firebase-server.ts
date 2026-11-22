import { createSign } from 'node:crypto';

type ServiceAccount = { project_id: string; client_email: string; private_key: string };
const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

async function getAccessToken(): Promise<{ token: string; projectId: string }> {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON não configurada.');
  let credentials: ServiceAccount;
  try { credentials = JSON.parse(raw) as ServiceAccount; }
  catch { throw new Error('Credenciais Firebase inválidas.'); }
  if (!credentials.client_email || !credentials.private_key || credentials.project_id !== 'tendidesk') {
    throw new Error('Conta de serviço Firebase não corresponde ao projeto TendiDesk.');
  }
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'RS256', typ: 'JWT' });
  const claims = encode({
    iss: credentials.client_email,
    sub: credentials.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    iat: now,
    exp: now + 3600,
  });
  const unsigned = `${header}.${claims}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(credentials.private_key).toString('base64url')}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Falha na autenticação do serviço Firebase.');
  const result = await response.json() as { access_token?: string };
  if (!result.access_token) throw new Error('Firebase não retornou token de acesso.');
  return { token: result.access_token, projectId: credentials.project_id };
}

export async function sendTestPush(fcmToken: string) {
  const { token, projectId } = await getAccessToken();
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token: fcmToken,
        data: {
          title: 'Teste de notificação TendiDesk',
          body: 'Seu dispositivo está preparado para receber lembretes.',
          path: '/agenda',
          tag: 'tendidesk-push-test',
        },
        webpush: { headers: { Urgency: 'high', TTL: '300' } },
      },
    }),
    cache: 'no-store',
  });
  if (!response.ok) {
    // Never expose the provider response or device token to the browser/logs.
    throw new Error(`Firebase recusou o envio (HTTP ${response.status}).`);
  }
}
