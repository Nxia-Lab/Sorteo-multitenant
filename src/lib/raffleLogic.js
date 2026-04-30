export function normalizeDate(value) {
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

export function isWithinWindow(startAt, endAt, now = new Date()) {
  const startDate = normalizeDate(startAt);
  const endDate = normalizeDate(endAt);

  if (!startDate || !endDate || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return false;
  }

  return now >= startDate && now <= endDate;
}

export function getRaffleDisplayName(raffle) {
  const candidates = [
    raffle?.name,
    raffle?.nombre,
    raffle?.title,
    raffle?.titulo,
    raffle?.displayName,
    raffle?.jornadaLabel,
  ];

  return candidates.map((value) => String(value || '').trim()).find(Boolean) || 'Sorteo vigente';
}

export function getRaffleStatusLabel(status) {
  const labels = {
    draft: 'Borrador',
    scheduled: 'Programado',
    active: 'Activo',
    paused: 'Pausado',
    manual_closed: 'Cerrado manualmente',
    expired: 'Finalizado',
    completed: 'Sorteado',
  };

  return labels[status] || 'Borrador';
}

export function getOperationalRaffleStatus(raffle, now = new Date()) {
  if (!raffle) {
    return 'draft';
  }

  if (raffle.status === 'completed') {
    return 'completed';
  }

  if (raffle.status === 'manual_closed' || raffle.status === 'expired') {
    return 'expired';
  }

  if (raffle.status === 'paused') {
    return 'paused';
  }

  const startDate = normalizeDate(raffle.startAt);
  const endDate = normalizeDate(raffle.endAt);

  if (endDate && !Number.isNaN(endDate.getTime()) && endDate < now) {
    return 'expired';
  }

  if (raffle.status === 'active') {
    return 'active';
  }

  if (startDate && !Number.isNaN(startDate.getTime()) && startDate > now) {
    return 'scheduled';
  }

  return 'draft';
}

export function getParticipantDni(participant) {
  return String(participant?.dni || participant?.id || '').trim();
}

export function countUniqueParticipants(participants, usedDnis = new Set()) {
  return participants.reduce((count, participant) => {
    const dni = getParticipantDni(participant);
    if (!dni || usedDnis.has(dni)) {
      return count;
    }

    usedDnis.add(dni);
    return count + 1;
  }, 0);
}

export function shuffleItems(items, random = Math.random) {
  return [...items]
    .map((item) => ({ item, order: random() }))
    .sort((first, second) => first.order - second.order)
    .map(({ item }) => item);
}

export function pickUniqueParticipants(participants, amount, usedDnis, random = Math.random) {
  const pickedParticipants = [];

  for (const participant of shuffleItems(participants, random)) {
    const dni = getParticipantDni(participant);
    if (!dni || usedDnis.has(dni)) {
      continue;
    }

    pickedParticipants.push(participant);
    usedDnis.add(dni);

    if (pickedParticipants.length >= amount) {
      break;
    }
  }

  return pickedParticipants;
}

export function buildDrawResult(raffle, participants, mode, winnersPerGroup, alternatesPerGroup, random = Math.random) {
  const eligibleParticipants = participants.filter((participant) => participant.raffleId === raffle.id);
  const groups = mode === 'branch'
    ? (raffle.enabledBranches || []).map((branchName) => ({
        label: branchName,
        participants: eligibleParticipants.filter((participant) => participant.sucursal === branchName),
      }))
    : [
        {
          label: 'Global',
          participants: eligibleParticipants,
        },
      ];

  const selectedDnis = new Set();

  return groups.map((group) => {
    const eligibleCount = countUniqueParticipants(group.participants, new Set(selectedDnis));
    const winners = pickUniqueParticipants(group.participants, winnersPerGroup, selectedDnis, random);
    const alternates = pickUniqueParticipants(group.participants, alternatesPerGroup, selectedDnis, random);

    return {
      group: group.label,
      eligibleCount,
      chanceCount: group.participants.length,
      winners: winners.map((participant) => ({
        id: participant.id,
        dni: participant.dni,
        nombre: participant.nombre,
        telefono: participant.telefono,
        sucursal: participant.sucursal,
      })),
      alternates: alternates.map((participant) => ({
        id: participant.id,
        dni: participant.dni,
        nombre: participant.nombre,
        telefono: participant.telefono,
        sucursal: participant.sucursal,
      })),
    };
  });
}

export function participantDate(participant) {
  return participant?.timestamp || participant?.createdAt || participant?.jornadaStartAt || null;
}

export function toMillis(value) {
  if (!value) {
    return 0;
  }

  const date = normalizeDate(value);
  return !date || Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export function buildExportableCustomers(participants) {
  const customersByDni = new Map();

  participants.forEach((participant) => {
    const dni = String(participant?.dni || '').trim();
    if (!dni) {
      return;
    }

    const existing = customersByDni.get(dni);
    const latestDate = participantDate(participant);
    const latestMillis = toMillis(latestDate);
    const branch = String(participant?.sucursal || '').trim();

    if (!existing) {
      customersByDni.set(dni, {
        dni,
        nombre: participant?.nombre || '',
        telefono: participant?.telefono || '',
        sucursal: branch,
        sucursales: new Set(branch ? [branch] : []),
        participaciones: 1,
        ultimoSorteo: participant?.raffleName || participant?.jornadaLabel || '',
        ultimaParticipacion: latestDate,
        ultimaParticipacionMillis: latestMillis,
      });
      return;
    }

    existing.participaciones += 1;
    if (branch) {
      existing.sucursales.add(branch);
    }

    if (latestMillis >= existing.ultimaParticipacionMillis) {
      existing.nombre = participant?.nombre || existing.nombre;
      existing.telefono = participant?.telefono || existing.telefono;
      existing.sucursal = branch || existing.sucursal;
      existing.ultimoSorteo = participant?.raffleName || participant?.jornadaLabel || existing.ultimoSorteo;
      existing.ultimaParticipacion = latestDate || existing.ultimaParticipacion;
      existing.ultimaParticipacionMillis = latestMillis;
    }
  });

  return Array.from(customersByDni.values()).sort((first, second) => {
    const branchCompare = String(first.sucursal || '').localeCompare(String(second.sucursal || ''), 'es');
    if (branchCompare !== 0) {
      return branchCompare;
    }

    return String(first.nombre || '').localeCompare(String(second.nombre || ''), 'es');
  });
}

export function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getHourKey(value) {
  const date = normalizeDate(value);
  if (!date || Number.isNaN(date.getTime())) {
    return '';
  }

  return `${String(date.getHours()).padStart(2, '0')}:00`;
}

export function buildRaffleMonitor(raffle, participants, branches, now = new Date()) {
  const raffleParticipants = participants.filter((participant) => participant.raffleId === raffle?.id);
  const todayStart = startOfLocalDay(now).getTime();
  const todayParticipants = raffleParticipants.filter((participant) => toMillis(participantDate(participant)) >= todayStart);
  const branchNames = (branches || [])
    .map((branch) => String(branch?.name || branch?.slug || branch?.id || '').trim())
    .filter(Boolean);
  const byBranch = branchNames.map((branchName) => {
    const branchParticipants = todayParticipants.filter((participant) => String(participant?.sucursal || '').trim() === branchName);
    const latestMillis = branchParticipants.reduce(
      (latest, participant) => Math.max(latest, toMillis(participantDate(participant))),
      0,
    );
    const hoursSinceLast = latestMillis ? (now.getTime() - latestMillis) / (60 * 60 * 1000) : Infinity;

    return {
      branchName,
      todayCount: branchParticipants.length,
      latestAt: latestMillis ? new Date(latestMillis) : null,
      alert: branchParticipants.length === 0 || hoursSinceLast >= 4,
    };
  });
  const hourlyMap = new Map();

  todayParticipants.forEach((participant) => {
    const hourKey = getHourKey(participantDate(participant));
    if (hourKey) {
      hourlyMap.set(hourKey, (hourlyMap.get(hourKey) || 0) + 1);
    }
  });

  const hourly = Array.from(hourlyMap.entries())
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([hour, count]) => ({ hour, count }));
  const latest = [...raffleParticipants]
    .sort((first, second) => toMillis(participantDate(second)) - toMillis(participantDate(first)))
    .slice(0, 6);

  return {
    totalCount: raffleParticipants.length,
    todayCount: todayParticipants.length,
    byBranch,
    hourly,
    latest,
    alerts: byBranch.filter((branch) => branch.alert),
  };
}

export function createReportHash(raffle, result) {
  const source = JSON.stringify({
    raffleId: raffle?.id || '',
    raffleName: raffle?.name || '',
    completedAt: raffle?.completedAt || '',
    result: result || raffle?.result || null,
  });
  let hash = 0x811c9dc5;

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `RPT-${(hash >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
}
