import { describe, expect, it } from 'vitest';
import {
  buildDrawResult,
  buildExportableCustomers,
  getOperationalRaffleStatus,
  getRaffleDisplayName,
  isWithinWindow,
} from './raffleLogic';

describe('raffle logic', () => {
  it('uses the best available raffle title', () => {
    expect(getRaffleDisplayName({ nombre: 'Promo Verano' })).toBe('Promo Verano');
    expect(getRaffleDisplayName({ name: 'Sorteo Central' })).toBe('Sorteo Central');
    expect(getRaffleDisplayName({})).toBe('Sorteo vigente');
  });

  it('detects active windows and scheduled states', () => {
    const now = new Date('2026-04-30T12:00:00');

    expect(isWithinWindow('2026-04-30T00:00:00', '2026-04-30T23:59:00', now)).toBe(true);
    expect(isWithinWindow('2026-05-01T00:00:00', '2026-05-01T23:59:00', now)).toBe(false);
    expect(getOperationalRaffleStatus({
      status: 'draft',
      startAt: '2026-05-01T00:00:00',
      endAt: '2026-05-01T23:59:00',
    }, now)).toBe('scheduled');
  });

  it('does not pick the same DNI twice between winners and alternates', () => {
    const raffle = { id: 'raffle-1', enabledBranches: ['Centro'] };
    const participants = [
      { id: 'a', raffleId: 'raffle-1', dni: '1', nombre: 'Ana', telefono: '1', sucursal: 'Centro' },
      { id: 'b', raffleId: 'raffle-1', dni: '1', nombre: 'Ana Bis', telefono: '2', sucursal: 'Centro' },
      { id: 'c', raffleId: 'raffle-1', dni: '2', nombre: 'Beto', telefono: '3', sucursal: 'Centro' },
    ];

    const [group] = buildDrawResult(raffle, participants, 'global', 1, 2, () => 0.1);
    const selectedDnis = [...group.winners, ...group.alternates].map((participant) => participant.dni);

    expect(new Set(selectedDnis).size).toBe(selectedDnis.length);
    expect(selectedDnis).toHaveLength(2);
    expect(group.chanceCount).toBe(3);
  });

  it('exports one customer row per DNI while preserving participation count', () => {
    const customers = buildExportableCustomers([
      {
        dni: '123',
        nombre: 'Ana',
        telefono: '111',
        sucursal: 'Centro',
        raffleName: 'Sorteo 1',
        timestamp: '2026-04-29T10:00:00',
      },
      {
        dni: '123',
        nombre: 'Ana Actualizada',
        telefono: '222',
        sucursal: 'Norte',
        raffleName: 'Sorteo 2',
        timestamp: '2026-04-30T10:00:00',
      },
    ]);

    expect(customers).toHaveLength(1);
    expect(customers[0].participaciones).toBe(2);
    expect(customers[0].nombre).toBe('Ana Actualizada');
    expect([...customers[0].sucursales].sort()).toEqual(['Centro', 'Norte']);
  });
});
