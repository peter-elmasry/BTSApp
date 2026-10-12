import { describe, expect, it } from 'vitest';
import { disclosureClass, expandItemClass, priorityClass, sortRows } from './data-table';

describe('data table column priority', () => {
  it('hides lower-priority columns until their breakpoint', () => {
    expect(priorityClass(undefined)).toBe('');
    expect(priorityClass(1)).toBe('');
    expect(priorityClass(2)).toBe('hidden sm:table-cell');
    expect(priorityClass(3)).toBe('hidden lg:table-cell');
  });

  it('keeps the row disclosure until every hidden column is visible', () => {
    expect(disclosureClass([{ priority: 1 }])).toBeNull();
    expect(disclosureClass([{ priority: 1 }, { priority: 2 }])).toBe('sm:hidden');
    expect(disclosureClass([{ priority: 2 }, { priority: 3 }])).toBe('lg:hidden');
    expect(expandItemClass(2)).toBe('sm:hidden');
    expect(expandItemClass(3)).toBe('lg:hidden');
  });
});

describe('data table sorting', () => {
  const rows = [
    { name: 'Lions', total: 4 },
    { name: 'Eagles', total: 9 },
    { name: 'Owls', total: null as number | null },
  ];
  it('sorts numbers and text in both directions and keeps blanks last', () => {
    const total = { key: 'total', header: 'Total', value: (row: (typeof rows)[0]) => row.total };
    expect(sortRows(rows, total, 'desc').map((row) => row.name)).toEqual([
      'Eagles',
      'Lions',
      'Owls',
    ]);
    expect(sortRows(rows, total, 'asc').map((row) => row.name)).toEqual([
      'Lions',
      'Eagles',
      'Owls',
    ]);
    const name = { key: 'name', header: 'Team', value: (row: (typeof rows)[0]) => row.name };
    expect(sortRows(rows, name, 'asc').map((row) => row.name)).toEqual(['Eagles', 'Lions', 'Owls']);
  });
  it('leaves order unchanged without a sort value', () => {
    expect(sortRows(rows, { key: 'x', header: 'X' }, 'asc')).toEqual(rows);
  });
});
