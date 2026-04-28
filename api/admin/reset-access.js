import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { validateStrongPassword } from '../../src/lib/passwordPolicy.js';

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

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  try {
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
      res.status(403).json({ error: 'No tenés permisos para resetear accesos.' });
      return;
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const tenantId = normalizeText(body.tenantId);
    const access = body.access || {};
    const accessEmail = normalizeEmail(access.email);
    const accessPassword = String(access.password || '');
    const accessDisplayName = normalizeText(access.displayName);

    if (!tenantId) {
      res.status(400).json({ error: 'El tenantId es obligatorio.' });
      return;
    }

    if (!accessEmail) {
      res.status(400).json({ error: 'El email de acceso es obligatorio.' });
      return;
    }

    if (accessPassword.length < 8) {
      res.status(400).json({ error: 'La contraseña temporal debe tener al menos 8 caracteres.' });
      return;
    }

    const passwordCheck = validateStrongPassword(accessPassword);
    if (!passwordCheck.isValid) {
      res.status(400).json({
        error: `La contraseña temporal debe cumplir: ${passwordCheck.issues.join(' ')}`,
      });
      return;
    }

    const tenantRef = firestore.collection('tenants').doc(tenantId);
    const tenantSnap = await tenantRef.get();

    if (!tenantSnap.exists) {
      res.status(404).json({ error: 'La empresa no existe.' });
      return;
    }

    const tenant = tenantSnap.data() || {};
    const previousOwnerUid = normalizeText(tenant.ownerUid);

    let authRecord;
    try {
      authRecord = await adminAuth.getUserByEmail(accessEmail);
      await adminAuth.updateUser(authRecord.uid, {
        displayName: accessDisplayName || tenant.displayName || accessEmail,
        password: accessPassword,
        disabled: false,
      });
    } catch (error) {
      if (error?.code !== 'auth/user-not-found') {
        throw error;
      }

      authRecord = await adminAuth.createUser({
        email: accessEmail,
        password: accessPassword,
        displayName: accessDisplayName || tenant.displayName || accessEmail,
        disabled: false,
      });
    }

    const profileRef = firestore.collection('users').doc(authRecord.uid);
    const profileSnap = await profileRef.get();
    const profileData = {
      email: accessEmail,
      displayName: accessDisplayName || tenant.displayName || accessEmail,
      role: 'tenant_admin',
      tenantId,
      active: true,
      mustChangePassword: true,
      tempPasswordCreatedAt: new Date(),
      updatedAt: new Date(),
    };

    if (!profileSnap.exists) {
      profileData.createdAt = new Date();
    }

    await profileRef.set(profileData, { merge: true });

    if (previousOwnerUid && previousOwnerUid !== authRecord.uid) {
      await adminAuth.updateUser(previousOwnerUid, { disabled: true }).catch(() => {});
      await firestore.collection('users').doc(previousOwnerUid).set(
        {
          active: false,
          tenantId,
          updatedAt: new Date(),
          disabledAt: new Date(),
          disabledReason: 'access_reset',
        },
        { merge: true },
      );
    }

    await tenantRef.set(
      {
        ownerUid: authRecord.uid,
        ownerEmail: accessEmail,
        updatedAt: new Date(),
      },
      { merge: true },
    );

    res.status(200).json({
      ok: true,
      tenantId,
      uid: authRecord.uid,
      email: accessEmail,
      displayName: accessDisplayName || tenant.displayName || accessEmail,
    });
  } catch (error) {
    console.error('reset-access error', error);
    res.status(500).json({
      error: error?.message || 'No pudimos resetear el acceso.',
    });
  }
}
