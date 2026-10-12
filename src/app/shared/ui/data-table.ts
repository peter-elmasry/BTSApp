import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChildren,
  Directive,
  inject,
  input,
  output,
  signal,
  TemplateRef,
} from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

export type DsRowStatus =
  'scheduled' | 'live' | 'pending' | 'late' | 'done' | 'void' | 'queued' | null;
export type DsPriority = 1 | 2 | 3;

/** One table column. `header` is already translated by the caller. */
export interface DsColumn<T> {
  key: string;
  header: string;
  /** 1 = always visible, 2 = from 640 px, 3 = from 1024 px. Defaults to 1. */
  priority?: DsPriority;
  align?: 'start' | 'end' | 'center';
  numeric?: boolean;
  sortable?: boolean;
  /** Plain-text cell value and sort key when no `dsCell` template is given. */
  value?: (row: T) => string | number | null | undefined;
  width?: string;
}

export interface DsSort {
  key: string;
  dir: 'asc' | 'desc';
}

/** `<ng-template dsCell="key" let-row>` renders a custom cell for the column `key`. */
@Directive({ selector: 'ng-template[dsCell]' })
export class DsCellDef {
  readonly dsCell = input.required<string>();
  readonly template = inject(TemplateRef);
}

/** Classes that hide lower-priority columns on narrow screens. */
export function priorityClass(priority: DsPriority | undefined): string {
  if (priority === 3) return 'hidden lg:table-cell';
  if (priority === 2) return 'hidden sm:table-cell';
  return '';
}

/** The row disclosure stays visible until every hidden column is shown. */
export function disclosureClass(
  columns: readonly Pick<DsColumn<unknown>, 'priority'>[],
): string | null {
  if (columns.some((column) => column.priority === 3)) return 'lg:hidden';
  if (columns.some((column) => column.priority === 2)) return 'sm:hidden';
  return null;
}

/** Expanded-row items hide again once their column is visible in the table. */
export function expandItemClass(priority: DsPriority | undefined): string {
  return priority === 2 ? 'sm:hidden' : priority === 3 ? 'lg:hidden' : '';
}

export function sortRows<T>(
  rows: readonly T[],
  column: DsColumn<T> | undefined,
  dir: 'asc' | 'desc',
): T[] {
  if (!column?.value) return [...rows];
  const read = column.value;
  const factor = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = read(a);
    const right = read(b);
    if (left === right) return 0;
    if (left === null || left === undefined) return 1;
    if (right === null || right === undefined) return -1;
    if (typeof left === 'number' && typeof right === 'number') return (left - right) * factor;
    return String(left).localeCompare(String(right)) * factor;
  });
}

const INTERACTIVE = 'a,button,input,select,textarea,label,summary';

@Component({
  selector: 'ds-data-table',
  imports: [NgTemplateOutlet, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './data-table.html',
  styleUrl: './data-table.css',
  host: { class: 'block min-w-0' },
})
export class DsDataTable<T> {
  readonly rows = input.required<readonly T[]>();
  readonly columns = input.required<readonly DsColumn<T>[]>();
  readonly trackBy = input.required<(row: T) => string>();
  readonly caption = input.required<string>();
  readonly loading = input(false);
  readonly emptyText = input('');
  readonly rowStatus = input<((row: T) => DsRowStatus) | null>(null);
  readonly highlight = input<((row: T) => boolean) | null>(null);
  /** When true rows are focusable and emit `rowClick`. */
  readonly clickable = input(false);
  readonly sort = input<DsSort | null>(null);
  readonly rowClick = output<T>();
  readonly sortChange = output<DsSort>();

  private readonly cells = contentChildren(DsCellDef);
  private readonly localSort = signal<DsSort | null>(null);
  readonly expanded = signal<ReadonlySet<string>>(new Set());

  readonly activeSort = computed(() => this.localSort() ?? this.sort());
  readonly templates = computed(
    () => new Map(this.cells().map((cell) => [cell.dsCell(), cell.template])),
  );
  readonly disclosure = computed(() => disclosureClass(this.columns()));
  readonly hiddenColumns = computed(() =>
    this.columns().filter((column) => (column.priority ?? 1) > 1),
  );
  readonly span = computed(() => this.columns().length + (this.disclosure() ? 1 : 0));
  readonly sorted = computed(() => {
    const sort = this.activeSort();
    if (!sort) return [...this.rows()];
    return sortRows(
      this.rows(),
      this.columns().find((column) => column.key === sort.key),
      sort.dir,
    );
  });
  readonly skeleton = [0, 1, 2];

  cellClass(column: DsColumn<T>): string {
    const align =
      column.align === 'end' || column.numeric
        ? 'text-end'
        : column.align === 'center'
          ? 'text-center'
          : 'text-start';
    return `${priorityClass(column.priority)} ${align}${column.numeric ? ' tabular' : ''}`.trim();
  }
  itemClass(column: DsColumn<T>): string {
    return expandItemClass(column.priority);
  }
  text(column: DsColumn<T>, row: T): string {
    const value = column.value?.(row);
    return value === null || value === undefined ? '—' : String(value);
  }
  status(row: T): DsRowStatus {
    return this.rowStatus()?.(row) ?? null;
  }
  isHighlighted(row: T): boolean {
    return this.highlight()?.(row) ?? false;
  }
  ariaSort(column: DsColumn<T>): string | null {
    if (!column.sortable) return null;
    const sort = this.activeSort();
    if (sort?.key !== column.key) return 'none';
    return sort.dir === 'asc' ? 'ascending' : 'descending';
  }
  toggleSort(column: DsColumn<T>) {
    const current = this.activeSort();
    const next: DsSort = {
      key: column.key,
      dir: current?.key === column.key && current.dir === 'asc' ? 'desc' : 'asc',
    };
    this.localSort.set(next);
    this.sortChange.emit(next);
  }
  isExpanded(row: T): boolean {
    return this.expanded().has(this.trackBy()(row));
  }
  toggleExpanded(row: T, event: Event) {
    event.stopPropagation();
    const key = this.trackBy()(row);
    const next = new Set(this.expanded());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.expanded.set(next);
  }
  activate(row: T, event: Event) {
    if (!this.clickable()) return;
    const target = event.target as Element | null;
    const interactive = target?.closest(INTERACTIVE);
    if (interactive && interactive !== event.currentTarget) return;
    if (event instanceof KeyboardEvent) {
      if (event.target !== event.currentTarget) return;
      event.preventDefault();
    }
    this.rowClick.emit(row);
  }
}
