import { TableView, natural } from './table-view';

interface Row {
  name: string;
  count: number;
}

describe('TableView', () => {
  const rows: Row[] = [
    { name: 'b', count: 2 },
    { name: 'a', count: 3 },
    { name: 'c', count: 1 },
  ];
  const make = () =>
    new TableView<Row>({ name: (x, y) => natural(x.name, y.name), count: (x, y) => x.count - y.count }, 'name');

  it('sorts by the default column, then toggles the direction on a second click', () => {
    const view = make();

    expect(view.sort(rows).map((r) => r.name)).toEqual(['a', 'b', 'c']);
    view.toggleSort('name');
    expect(view.sort(rows).map((r) => r.name)).toEqual(['c', 'b', 'a']);
    expect(view.ariaSort('name')).toBe('descending');
    expect(view.arrow('name')).toBe('↓');
  });

  it('starts ascending on a new column and leaves the input untouched', () => {
    const view = make();

    view.toggleSort('count');

    expect(view.sort(rows).map((r) => r.count)).toEqual([1, 2, 3]);
    expect(view.ariaSort('name')).toBe('none');
    expect(view.arrow('name')).toBe('');
    expect(rows.map((r) => r.name)).toEqual(['b', 'a', 'c']);
  });

  it('paginates and bounds the page when the list shrinks', () => {
    const view = make();
    view.pageSize.set(2);
    const sorted = view.sort(rows);

    expect(view.slice(sorted)).toEqual(jasmine.objectContaining({ from: 1, to: 2, total: 3, page: 0, pageCount: 2 }));
    view.page.set(1);
    expect(view.slice(sorted).rows.map((r) => r.name)).toEqual(['c']);
    view.page.set(5);
    expect(view.slice(sorted).page).toBe(1);
    expect(view.slice([]).from).toBe(0);
  });

  it('goes back to the first page when the sort or the page size changes', () => {
    const view = make();
    view.page.set(2);
    view.toggleSort('count');
    expect(view.page()).toBe(0);
    view.page.set(2);
    view.setPageSize(50);
    expect(view.page()).toBe(0);
  });

  it('compares versions naturally: 1.3 before 1.10', () => {
    expect(['1.10', '1.3', '1.2'].sort(natural)).toEqual(['1.2', '1.3', '1.10']);
  });
});
