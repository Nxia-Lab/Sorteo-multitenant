import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  deleteDoc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  limit,
  onSnapshot,
  query,
  increment,
  setDoc,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import { ROLES } from './tenantModel';

export function subscribeUserProfile(uid, callback, onError) {
  if (!uid) {
    callback(null);
    return () => {};
  }

  return onSnapshot(
    doc(db, 'users', uid),
    (snapshot) => {
      callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
    },
    (error) => {
      if (onError) {
        onError(error);
      }
    },
  );
}

export function subscribeTenant(tenantId, callback, onError) {
  if (!tenantId) {
    callback(null);
    return () => {};
  }

  return onSnapshot(
    doc(db, 'tenants', tenantId),
    (snapshot) => {
      callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
    },
    (error) => {
      if (onError) {
        onError(error);
      }
    },
  );
}

export function subscribeAllTenants(callback, onError) {
  return onSnapshot(
    query(collection(db, 'tenants')),
    (snapshot) => {
      callback(
        [...normalizeTenantCollection(snapshot)].sort((first, second) => {
          const firstCreated =
            typeof first?.createdAt?.toDate === 'function'
              ? first.createdAt.toDate().getTime()
              : new Date(first?.createdAt ?? 0).getTime();
          const secondCreated =
            typeof second?.createdAt?.toDate === 'function'
              ? second.createdAt.toDate().getTime()
              : new Date(second?.createdAt ?? 0).getTime();
          return secondCreated - firstCreated;
        }),
      );
    },
    (error) => {
      if (onError) {
        onError(error);
      }
    },
  );
}

export function subscribePlatformSettings(callback, onError) {
  return onSnapshot(
    doc(db, 'platform', 'settings'),
    (snapshot) => {
      callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
    },
    (error) => {
      if (onError) {
        onError(error);
      }
    },
  );
}

export async function updatePlatformSettings(settings) {
  await setDoc(
    doc(db, 'platform', 'settings'),
    {
      branding: {
        displayName: String(settings?.branding?.displayName || '').trim(),
        primaryColor: String(settings?.branding?.primaryColor || '#007de8').trim(),
        logoUrl: String(settings?.branding?.logoUrl || '').trim(),
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

function tenantCollection(tenantId, collectionId) {
  return collection(db, 'tenants', tenantId, collectionId);
}

function sortBySortOrderThenName(items) {
  return [...items].sort((first, second) => {
    const firstOrder = Number(first?.sortOrder ?? 0);
    const secondOrder = Number(second?.sortOrder ?? 0);
    if (firstOrder !== secondOrder) {
      return firstOrder - secondOrder;
    }

    return String(first?.name ?? '').localeCompare(String(second?.name ?? ''), 'es');
  });
}

function normalizeTenantCollection(snapshot) {
  return snapshot.docs.map((item) => ({
    id: item.id,
    ...item.data(),
  }));
}

export async function fetchUserProfileByUid(uid) {
  if (!uid) {
    return null;
  }

  let snapshot;

  try {
    snapshot = await getDocFromServer(doc(db, 'users', uid));
  } catch (error) {
    snapshot = await getDoc(doc(db, 'users', uid));
  }

  if (!snapshot.exists()) {
    return null;
  }

  return { id: snapshot.id, ...snapshot.data() };
}

export async function fetchUserProfileByEmail(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  const profileQuery = query(
    collection(db, 'users'),
    where('email', '==', normalizedEmail),
    limit(1),
  );

  try {
    const snapshot = await getDocsFromServer(profileQuery);
    const firstDoc = snapshot.docs[0];
    if (!firstDoc) {
      return null;
    }

    return { id: firstDoc.id, ...firstDoc.data() };
  } catch (error) {
    return null;
  }
}

export async function fetchTenantById(tenantId) {
  if (!tenantId) {
    return null;
  }

  let snapshot;

  try {
    snapshot = await getDocFromServer(doc(db, 'tenants', tenantId));
  } catch (error) {
    snapshot = await getDoc(doc(db, 'tenants', tenantId));
  }

  if (!snapshot.exists()) {
    return null;
  }

  return { id: snapshot.id, ...snapshot.data() };
}

export async function createTenant(tenant) {
  const slug = String(tenant?.slug || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!slug) {
    throw new Error('El slug del tenant es obligatorio.');
  }

  const payload = {
    displayName: String(tenant?.displayName || '').trim(),
    slug,
    status: tenant?.status === 'paused' ? 'paused' : 'active',
    branding: {
      displayName: String(tenant?.branding?.displayName || '').trim(),
      name: String(tenant?.branding?.name || '').trim(),
      primaryColor: String(tenant?.branding?.primaryColor || '#007de8').trim(),
      logoUrl: String(tenant?.branding?.logoUrl || '').trim(),
    },
    ownerUid: String(tenant?.ownerUid || '').trim() || null,
    ownerEmail: String(tenant?.ownerEmail || '').trim() || null,
    branches: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, 'tenants', slug), payload, { merge: false });

  const branches = Array.isArray(tenant?.branches) ? tenant.branches : [];
  const normalizedBranches = [];
  for (const branch of branches) {
    const branchSlug = String(branch?.slug || branch?.name || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!branchSlug) {
      continue;
    }

    normalizedBranches.push({
      name: String(branch?.name || branchSlug).trim(),
      slug: branchSlug,
      address: String(branch?.address || '').trim(),
      phone: String(branch?.phone || '').trim(),
      contactName: String(branch?.contactName || '').trim(),
      notes: String(branch?.notes || '').trim(),
      active: branch?.active !== false,
      sortOrder: Number.isFinite(Number(branch?.sortOrder)) ? Number(branch.sortOrder) : 1,
    });

    await setDoc(
      doc(db, 'tenants', slug, 'branches', branchSlug),
      {
        tenantId: slug,
        name: String(branch?.name || branchSlug).trim(),
        slug: branchSlug,
        address: String(branch?.address || '').trim(),
        phone: String(branch?.phone || '').trim(),
        contactName: String(branch?.contactName || '').trim(),
        notes: String(branch?.notes || '').trim(),
        active: branch?.active !== false,
        sortOrder: Number.isFinite(Number(branch?.sortOrder)) ? Number(branch.sortOrder) : 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: false },
    );
  }

  if (normalizedBranches.length > 0) {
    await updateDoc(doc(db, 'tenants', slug), {
      branches: normalizedBranches,
      updatedAt: serverTimestamp(),
    });
  }

  return slug;
}

export async function updateTenant(tenantId, tenant) {
  if (!tenantId) {
    throw new Error('tenantId es requerido para actualizar una empresa.');
  }

  const payload = {
    displayName: String(tenant?.displayName || '').trim(),
    status: tenant?.status === 'paused' ? 'paused' : 'active',
    branding: {
      displayName: String(tenant?.branding?.displayName || '').trim(),
      name: String(tenant?.branding?.name || '').trim(),
      primaryColor: String(tenant?.branding?.primaryColor || '#007de8').trim(),
      logoUrl: String(tenant?.branding?.logoUrl || '').trim(),
    },
    ownerUid: String(tenant?.ownerUid || '').trim() || null,
    ownerEmail: String(tenant?.ownerEmail || '').trim() || null,
    branches: [],
    updatedAt: serverTimestamp(),
  };

  await updateDoc(doc(db, 'tenants', tenantId), payload);

  const branches = Array.isArray(tenant?.branches) ? tenant.branches : [];
  const branchSnapshot = await getDocs(query(tenantCollection(tenantId, 'branches'))).catch(() => null);

  if (branchSnapshot?.docs?.length) {
    await Promise.all(branchSnapshot.docs.map((branchDoc) => deleteDoc(branchDoc.ref)));
  }

  const normalizedBranches = [];
  for (const branch of branches) {
    const branchSlug = String(branch?.slug || branch?.name || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!branchSlug) {
      continue;
    }

    normalizedBranches.push({
      name: String(branch?.name || branchSlug).trim(),
      slug: branchSlug,
      address: String(branch?.address || '').trim(),
      phone: String(branch?.phone || '').trim(),
      contactName: String(branch?.contactName || '').trim(),
      notes: String(branch?.notes || '').trim(),
      active: branch?.active !== false,
      sortOrder: Number.isFinite(Number(branch?.sortOrder)) ? Number(branch.sortOrder) : 1,
    });

    await setDoc(
      doc(db, 'tenants', tenantId, 'branches', branchSlug),
      {
        tenantId,
        name: String(branch?.name || branchSlug).trim(),
        slug: branchSlug,
        address: String(branch?.address || '').trim(),
        phone: String(branch?.phone || '').trim(),
        contactName: String(branch?.contactName || '').trim(),
        notes: String(branch?.notes || '').trim(),
        active: branch?.active !== false,
        sortOrder: Number.isFinite(Number(branch?.sortOrder)) ? Number(branch.sortOrder) : 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: false },
    );
  }

  await updateDoc(doc(db, 'tenants', tenantId), {
    branches: normalizedBranches,
    updatedAt: serverTimestamp(),
  });
}

export function subscribeTenantBranches(tenantId, callback, onError) {
  if (!tenantId) {
    callback([]);
    return () => {};
  }

  return onSnapshot(
    query(tenantCollection(tenantId, 'branches')),
    (snapshot) => {
      callback(sortBySortOrderThenName(normalizeTenantCollection(snapshot)));
    },
    (error) => {
      if (onError) {
        onError(error);
      }
    },
  );
}

export function subscribeTenantRaffles(tenantId, callback, onError) {
  if (!tenantId) {
    callback([]);
    return () => {};
  }

  return onSnapshot(
    query(tenantCollection(tenantId, 'raffles')),
    (snapshot) => {
      callback(
        [...normalizeTenantCollection(snapshot)].sort((first, second) => {
          const firstCreated = typeof first?.createdAt?.toDate === 'function'
            ? first.createdAt.toDate().getTime()
            : new Date(first?.createdAt ?? 0).getTime();
          const secondCreated = typeof second?.createdAt?.toDate === 'function'
            ? second.createdAt.toDate().getTime()
            : new Date(second?.createdAt ?? 0).getTime();
          return secondCreated - firstCreated;
        }),
      );
    },
    (error) => {
      if (onError) {
        onError(error);
      }
    },
  );
}

export function subscribeTenantParticipants(tenantId, callback, onError, raffleId = '') {
  if (!tenantId) {
    callback([]);
    return () => {};
  }

  const baseQuery = raffleId
    ? query(tenantCollection(tenantId, 'participants'), where('raffleId', '==', raffleId))
    : query(tenantCollection(tenantId, 'participants'));

  return onSnapshot(
    baseQuery,
    (snapshot) => {
      callback(
        [...normalizeTenantCollection(snapshot)].sort((first, second) => {
          const firstTimestamp =
            typeof first?.timestamp?.toDate === 'function'
              ? first.timestamp.toDate().getTime()
              : new Date(first?.timestamp ?? 0).getTime();
          const secondTimestamp =
            typeof second?.timestamp?.toDate === 'function'
              ? second.timestamp.toDate().getTime()
              : new Date(second?.timestamp ?? 0).getTime();
          return secondTimestamp - firstTimestamp;
        }),
      );
    },
    (error) => {
      if (onError) {
        onError(error);
      }
    },
  );
}

export async function createTenantRaffle(tenantId, raffle) {
  if (!tenantId) {
    throw new Error('tenantId es requerido para crear un sorteo.');
  }

  const payload = {
    tenantId,
    name: String(raffle?.name || '').trim(),
    startAt: raffle?.startAt,
    endAt: raffle?.endAt,
    status: 'draft',
    enabledBranches: Array.isArray(raffle?.enabledBranches) ? raffle.enabledBranches : [],
    drawMode: raffle?.drawMode === 'branch' ? 'branch' : 'global',
    winnersPerGroup: Number.isFinite(Number(raffle?.winnersPerGroup)) ? Number(raffle.winnersPerGroup) : 1,
    alternatesPerGroup: Number.isFinite(Number(raffle?.alternatesPerGroup)) ? Number(raffle.alternatesPerGroup) : 2,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    completedAt: null,
    result: null,
  };

  const newDoc = await addDoc(tenantCollection(tenantId, 'raffles'), payload);
  return newDoc.id;
}

export async function updateTenantRaffle(tenantId, raffleId, data) {
  if (!tenantId || !raffleId) {
    throw new Error('tenantId y raffleId son requeridos.');
  }

  await updateDoc(doc(db, 'tenants', tenantId, 'raffles', raffleId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function createTenantParticipant(tenantId, participant) {
  if (!tenantId) {
    throw new Error('tenantId es requerido para crear participantes.');
  }

  const participantDni = String(participant?.dni || '').trim();
  const raffleId = String(participant?.raffleId || '').trim();
  if (!participantDni) {
    throw new Error('Necesitamos un DNI para guardar al participante.');
  }
  if (!raffleId) {
    throw new Error('Necesitamos un sorteo para guardar al participante.');
  }

  const chanceId = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const participantId = `${raffleId}__${participantDni}__${chanceId}`;

  const payload = {
    tenantId,
    dni: participantDni,
    nombre: String(participant?.nombre || '').trim(),
    telefono: String(participant?.telefono || '').trim(),
    sucursal: String(participant?.sucursal || '').trim(),
    raffleId,
    raffleName: String(participant?.raffleName || '').trim(),
    jornadaKey: String(participant?.jornadaKey || '').trim(),
    jornadaLabel: String(participant?.jornadaLabel || '').trim(),
    jornadaStartAt: participant?.jornadaStartAt,
    jornadaEndAt: participant?.jornadaEndAt,
    timestamp: serverTimestamp(),
  };

  await setDoc(doc(db, 'tenants', tenantId, 'participants', participantId), payload, { merge: true });

  await setDoc(
    doc(db, 'tenants', tenantId, 'customers', participantDni),
    {
      tenantId,
      dni: participantDni,
      nombre: String(participant?.nombre || '').trim(),
      telefono: String(participant?.telefono || '').trim(),
      sucursales: arrayUnion(String(participant?.sucursal || '').trim()),
      lastRaffleId: raffleId,
      lastRaffleName: String(participant?.raffleName || '').trim(),
      lastJornadaKey: String(participant?.jornadaKey || '').trim(),
      lastJornadaLabel: String(participant?.jornadaLabel || '').trim(),
      lastParticipationAt: serverTimestamp(),
      totalParticipations: increment(1),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export function resolveTenantId(profile, email = '') {
  const explicitTenantId = String(
    profile?.tenantId || profile?.tenantID || profile?.tenant_id || profile?.tenant || '',
  )
    .trim()
    .toLowerCase();

  if (explicitTenantId) {
    return explicitTenantId;
  }

  if (profile?.role === ROLES.SUPERADMIN) {
    return 'global';
  }

  const emailTenant = String(email || profile?.email || '')
    .trim()
    .toLowerCase()
    .split('@')[0];

  return emailTenant || '';
}

export function resolvePortalRoute(profile) {
  if (!profile) {
    return '/';
  }

  if (profile.role === ROLES.SUPERADMIN) {
    return '/admin';
  }

  const tenantId = resolveTenantId(profile);
  if (tenantId) {
    return `/tenant/${tenantId}`;
  }

  return '/';
}

export function getTenantDisplayName(tenant) {
  const displayName =
    tenant?.displayName ||
    tenant?.branding?.displayName ||
    tenant?.branding?.name ||
    tenant?.name ||
    tenant?.slug ||
    tenant?.id ||
    '';

  return String(displayName).trim() || 'Empresa sin nombre';
}
