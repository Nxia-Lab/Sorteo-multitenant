import crypto from 'node:crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';

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

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeSlug(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeDni(value) {
  return normalizeText(value).replace(/\D+/g, '');
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  if (typeof value?.toDate === 'function') {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  return new Date(value);
}

function isWithinWindow(startAt, endAt, now = new Date()) {
  const startDate = normalizeDate(startAt);
  const endDate = normalizeDate(endAt);

  if (!startDate || !endDate || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return false;
  }

  return now >= startDate && now <= endDate;
}

function getRaffleDisplayName(raffle) {
  const candidates = [
    raffle?.name,
    raffle?.nombre,
    raffle?.title,
    raffle?.titulo,
    raffle?.displayName,
    raffle?.jornadaLabel,
  ];

  return candidates.map((value) => normalizeText(value)).find(Boolean) || 'Sorteo vigente';
}

function getClientIp(req) {
  const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwardedFor || String(req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown').trim();
}

function hashKey(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

async function assertRateLimit(firestore, key, { limit, windowMs }) {
  const now = Date.now();
  const ref = firestore.collection('publicRateLimits').doc(hashKey(key));

  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.exists ? snapshot.data() || {} : {};
    const resetAt = normalizeDate(data.resetAt);
    const count = resetAt && resetAt.getTime() > now ? Number(data.count || 0) : 0;

    if (count >= limit) {
      throw new Error('Demasiados intentos. Esperá unos minutos y volvé a escanear el QR.');
    }

    transaction.set(
      ref,
      {
        count: count + 1,
        resetAt: Timestamp.fromDate(new Date(now + windowMs)),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const tenantId = normalizeSlug(body.tenantId);
    const branchSlug = normalizeSlug(body.branchSlug);
    const dni = normalizeDni(body.dni);
    const nombre = normalizeText(body.nombre);
    const telefono = normalizeText(body.telefono);

    if (!tenantId || !branchSlug) {
      res.status(400).json({ error: 'El QR no corresponde a una empresa y sucursal válidas.' });
      return;
    }

    if (!dni || !nombre || !telefono) {
      res.status(400).json({ error: 'Completá nombre, DNI y teléfono antes de continuar.' });
      return;
    }

    const app = getAdminApp();
    const firestore = getFirestore(app);
    const ip = getClientIp(req);

    await assertRateLimit(firestore, `ip:${ip}:tenant:${tenantId}:branch:${branchSlug}`, {
      limit: 60,
      windowMs: 10 * 60 * 1000,
    });
    await assertRateLimit(firestore, `dni:${tenantId}:${branchSlug}:${dni}`, {
      limit: 30,
      windowMs: 60 * 60 * 1000,
    });

    const tenantRef = firestore.collection('tenants').doc(tenantId);
    const tenantSnap = await tenantRef.get();

    if (!tenantSnap.exists || tenantSnap.data()?.status !== 'active') {
      res.status(409).json({ error: 'La empresa no tiene el registro habilitado en este momento.' });
      return;
    }

    const branchRef = tenantRef.collection('branches').doc(branchSlug);
    const branchSnap = await branchRef.get();
    const branch = branchSnap.exists ? branchSnap.data() || {} : null;

    if (!branch || branch.active === false) {
      res.status(409).json({ error: 'Esta sucursal no tiene el registro habilitado.' });
      return;
    }

    const branchName = normalizeText(branch.name || branch.slug || branchSlug);
    const rafflesSnap = await tenantRef.collection('raffles')
      .where('status', '==', 'active')
      .where('enabledBranches', 'array-contains', branchName)
      .get();

    const now = new Date();
    const activeRaffles = rafflesSnap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((raffle) => isWithinWindow(raffle.startAt, raffle.endAt, now));

    if (activeRaffles.length === 0) {
      res.status(409).json({ error: 'No hay un sorteo activo para esta sucursal en este momento.' });
      return;
    }

    if (activeRaffles.length > 1) {
      res.status(409).json({ error: 'Hay más de un sorteo activo para esta sucursal. Avisale al administrador.' });
      return;
    }

    const raffle = activeRaffles[0];
    const raffleName = getRaffleDisplayName(raffle);
    const chanceId = crypto.randomUUID();
    const participantId = `${raffle.id}__${dni}__${chanceId}`;
    const participantRef = tenantRef.collection('participants').doc(participantId);
    const customerRef = tenantRef.collection('customers').doc(dni);

    await firestore.runTransaction(async (transaction) => {
      transaction.set(participantRef, {
        tenantId,
        dni,
        nombre,
        telefono,
        sucursal: branchName,
        raffleId: raffle.id,
        raffleName,
        jornadaKey: raffle.id,
        jornadaLabel: raffleName,
        jornadaStartAt: raffle.startAt,
        jornadaEndAt: raffle.endAt,
        timestamp: FieldValue.serverTimestamp(),
      });

      transaction.set(
        customerRef,
        {
          tenantId,
          dni,
          nombre,
          telefono,
          sucursales: FieldValue.arrayUnion(branchName),
          lastRaffleId: raffle.id,
          lastRaffleName: raffleName,
          lastJornadaKey: raffle.id,
          lastJornadaLabel: raffleName,
          lastParticipationAt: FieldValue.serverTimestamp(),
          totalParticipations: FieldValue.increment(1),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });

    res.status(200).json({
      ok: true,
      tenantId,
      branchName,
      raffleId: raffle.id,
      raffleName,
      message: `Tu chance en ${raffleName} quedó registrada para ${branchName}.`,
    });
  } catch (error) {
    const message = error?.message || 'No pudimos guardar la inscripción. Intentá otra vez.';
    const status = message.startsWith('Demasiados intentos') ? 429 : 500;
    res.status(status).json({ error: message });
  }
}
