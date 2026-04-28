import { initializeApp, getApps } from 'firebase/app';
import { createUserWithEmailAndPassword, deleteUser, getAuth, signOut, updateProfile } from 'firebase/auth';
import { collection, deleteDoc, doc, getDocsFromServer, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, firebaseConfig } from './firebase';
import { validateStrongPassword } from './passwordPolicy';
import { createTenant } from './portal';
import { ROLES } from './tenantModel';

const PROVISIONING_APP_NAME = 'tenant-provisioning';

function getProvisioningAuth() {
  const existingApp = getApps().find((app) => app.name === PROVISIONING_APP_NAME);
  const app = existingApp || initializeApp(firebaseConfig, PROVISIONING_APP_NAME);
  return getAuth(app);
}

async function rollbackTenant(tenantId) {
  const branchesSnapshot = await getDocsFromServer(query(collection(db, 'tenants', tenantId, 'branches'))).catch(() => null);
  const branchDocs = branchesSnapshot?.docs || [];

  await Promise.all(branchDocs.map((branchDoc) => deleteDoc(branchDoc.ref).catch(() => {})));
  await deleteDoc(doc(db, 'tenants', tenantId)).catch(() => {});
}

export async function createTenantAdminAccess({
  email,
  password,
  displayName,
  tenantId,
  tenantDisplayName,
}) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedPassword = String(password || '');
  const normalizedDisplayName = String(displayName || tenantDisplayName || '').trim();

  if (!normalizedEmail) {
    throw new Error('El email de acceso es obligatorio.');
  }

  if (normalizedPassword.length < 6) {
    throw new Error('La contraseña temporal debe tener al menos 8 caracteres.');
  }

  const passwordCheck = validateStrongPassword(normalizedPassword);
  if (!passwordCheck.isValid) {
    throw new Error(`La contraseña temporal debe cumplir: ${passwordCheck.issues.join(' ')}`);
  }

  if (!tenantId) {
    throw new Error('El tenantId es obligatorio para crear el acceso.');
  }

  const auth = getProvisioningAuth();
  const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, normalizedPassword);

  if (normalizedDisplayName) {
    await updateProfile(credential.user, { displayName: normalizedDisplayName });
  }

  await setDoc(
    doc(db, 'users', credential.user.uid),
    {
      email: normalizedEmail,
      displayName: normalizedDisplayName || tenantDisplayName || normalizedEmail,
      role: ROLES.TENANT_ADMIN,
      tenantId,
      active: true,
      mustChangePassword: true,
      tempPasswordCreatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  await signOut(auth).catch(() => {});

  return {
    uid: credential.user.uid,
    email: normalizedEmail,
    displayName: normalizedDisplayName || tenantDisplayName || normalizedEmail,
  };
}

export async function createTenantWithAccess({
  tenant,
  access,
}) {
  const accessEmail = String(access?.email || '').trim().toLowerCase();
  const accessPassword = String(access?.password || '');
  const accessDisplayName = String(access?.displayName || '').trim();
  const tenantDisplayName = String(tenant?.displayName || '').trim();

  if (!accessEmail) {
    throw new Error('El email de acceso es obligatorio.');
  }

  if (accessPassword.length < 6) {
    throw new Error('La contraseña temporal debe tener al menos 8 caracteres.');
  }

  const passwordCheck = validateStrongPassword(accessPassword);
  if (!passwordCheck.isValid) {
    throw new Error(`La contraseña temporal debe cumplir: ${passwordCheck.issues.join(' ')}`);
  }

  const auth = getProvisioningAuth();
  const credential = await createUserWithEmailAndPassword(auth, accessEmail, accessPassword);

  try {
    if (accessDisplayName) {
      await updateProfile(credential.user, { displayName: accessDisplayName });
    }

    const slug = await createTenant({
      ...tenant,
      ownerUid: credential.user.uid,
      ownerEmail: accessEmail,
    });

    try {
      await setDoc(
        doc(db, 'users', credential.user.uid),
        {
          email: accessEmail,
          displayName: accessDisplayName || tenantDisplayName || accessEmail,
          role: ROLES.TENANT_ADMIN,
          tenantId: slug,
          active: true,
          mustChangePassword: true,
          tempPasswordCreatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } catch (profileError) {
      await rollbackTenant(slug);
      throw profileError;
    }

    await signOut(auth).catch(() => {});

    return {
      uid: credential.user.uid,
      email: accessEmail,
      displayName: accessDisplayName || tenantDisplayName || accessEmail,
      tenantId: slug,
    };
  } catch (error) {
    await deleteUser(credential.user).catch(() => {});
    await signOut(auth).catch(() => {});
    throw error;
  }
}

export async function sendTenantAccessEmail({
  email,
  password,
  tenantName,
  portalUrl,
  idToken,
}) {
  const response = await fetch('/api/admin/send-access-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${String(idToken || '').trim()}`,
    },
    body: JSON.stringify({
      email,
      password,
      tenantName,
      portalUrl,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.error || 'No pudimos enviar el email de acceso.');
  }

  return payload;
}

export async function resetTenantAccess({
  tenantId,
  access,
  idToken,
}) {
  const response = await fetch('/api/admin/reset-access', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${String(idToken || '').trim()}`,
    },
    body: JSON.stringify({
      tenantId,
      access,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.error || 'No pudimos resetear el acceso.');
  }

  return payload;
}
