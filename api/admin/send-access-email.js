import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function getAdminApp() {
  const existingApp = getApps()[0];
  if (existingApp) {
    return existingApp;
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Faltan credenciales de Firebase Admin.');
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || '').trim();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildEmailHtml({ tenantName, email, password, portalUrl }) {
  const safeTenantName = escapeHtml(tenantName || 'tu empresa');
  const safeEmail = escapeHtml(email);
  const safePassword = escapeHtml(password);
  const safePortalUrl = escapeHtml(portalUrl);

  return `
    <div style="font-family:Arial,sans-serif;background:#f4f7fb;padding:28px;color:#172033">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #dfe7f2;border-radius:18px;padding:28px">
        <p style="margin:0 0 10px;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#007de8;font-weight:700">Portal de empresas</p>
        <h1 style="margin:0 0 12px;font-size:24px;color:#111827">Acceso creado para ${safeTenantName}</h1>
        <p style="font-size:15px;line-height:1.6;color:#475569">Ya podés ingresar al panel de tu empresa con estos datos temporales. En el primer ingreso el sistema te va a pedir cambiar la contraseña.</p>
        <div style="margin:22px 0;border:1px solid #dfe7f2;border-radius:14px;overflow:hidden">
          <div style="padding:14px 16px;border-bottom:1px solid #dfe7f2;background:#f8fafc">
            <strong>Usuario:</strong> ${safeEmail}
          </div>
          <div style="padding:14px 16px;background:#f8fafc">
            <strong>Contraseña temporal:</strong> ${safePassword}
          </div>
        </div>
        <a href="${safePortalUrl}" style="display:inline-block;background:#007de8;color:white;text-decoration:none;border-radius:999px;padding:13px 20px;font-weight:700">Ingresar al portal</a>
        <p style="margin-top:22px;font-size:13px;line-height:1.6;color:#64748b">Si el botón no funciona, copiá y pegá este enlace en el navegador:<br>${safePortalUrl}</p>
      </div>
    </div>
  `;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  try {
    const resendApiKey = process.env.RESEND_API_KEY;
    const from = process.env.ACCESS_EMAIL_FROM;

    if (!resendApiKey || !from) {
      res.status(500).json({ error: 'Falta configurar RESEND_API_KEY o ACCESS_EMAIL_FROM.' });
      return;
    }

    const authHeader = String(req.headers.authorization || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    if (!token) {
      res.status(401).json({ error: 'Falta autorización.' });
      return;
    }

    const app = getAdminApp();
    const adminAuth = getAuth(app);
    const firestore = getFirestore(app);

    const decoded = await adminAuth.verifyIdToken(token);
    const requesterDoc = await firestore.collection('users').doc(decoded.uid).get();

    if (!requesterDoc.exists || requesterDoc.data()?.role !== 'superadmin' || requesterDoc.data()?.active === false) {
      res.status(403).json({ error: 'No tenés permisos para enviar accesos.' });
      return;
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');
    const tenantName = normalizeText(body.tenantName);
    const portalUrl = normalizeText(body.portalUrl || process.env.APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || '');

    if (!email || !password || !portalUrl) {
      res.status(400).json({ error: 'Faltan email, contraseña temporal o link del portal.' });
      return;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: `Acceso al portal - ${tenantName || 'Empresa'}`,
        html: buildEmailHtml({ tenantName, email, password, portalUrl }),
      }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      res.status(500).json({ error: payload?.message || 'No pudimos enviar el email de acceso.' });
      return;
    }

    res.status(200).json({ ok: true, id: payload?.id || '' });
  } catch (error) {
    console.error('send-access-email error', error);
    res.status(500).json({ error: error?.message || 'No pudimos enviar el email de acceso.' });
  }
}
