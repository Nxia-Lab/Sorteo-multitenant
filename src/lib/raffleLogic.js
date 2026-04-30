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
