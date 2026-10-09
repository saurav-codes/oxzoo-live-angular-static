import { Component, OnInit, signal } from '@angular/core';
import { loadConfig } from './config';
import { itemsOf, PEER_TIMEOUT_MS } from './probe';

interface Row {
  sku: string;
  name: string;
  price: string;
}

// catalog-api's item fields are not fixed yet: show what is there.
function toRow(item: unknown): Row {
  const i = (item ?? {}) as Record<string, unknown>;
  const text = (v: unknown) => (v === undefined || v === null ? '' : String(v));
  return { sku: text(i['sku'] ?? i['id']), name: text(i['name'] ?? i['title']), price: text(i['price'] ?? i['price_cents']) };
}

@Component({
  selector: 'app-catalog',
  template: `<h1>Catalog</h1>
    <p class="subtle">Fetched by your browser from {{ source() || 'CATALOG_URL (not set)' }} over CORS.</p>
    @if (error()) {
      <p class="bad">{{ error() }}</p>
    } @else if (loading()) {
      <p>Loading...</p>
    } @else {
      <table>
        <tr><th>SKU</th><th>Name</th><th>Price</th></tr>
        @for (row of rows(); track $index) {
          <tr><td>{{ row.sku }}</td><td>{{ row.name }}</td><td>{{ row.price }}</td></tr>
        } @empty {
          <tr><td colspan="3" class="subtle">No items.</td></tr>
        }
      </table>
    }`,
})
export class CatalogPage implements OnInit {
  rows = signal<Row[]>([]);
  loading = signal(true);
  error = signal('');
  source = signal('');

  async ngOnInit(): Promise<void> {
    try {
      const config = await loadConfig();
      if (!config.catalog_url) throw new Error('CATALOG_URL is not set at build time');
      this.source.set(config.catalog_url);
      const res = await fetch(`${config.catalog_url}/api/items`, { mode: 'cors', credentials: 'omit', signal: AbortSignal.timeout(PEER_TIMEOUT_MS) });
      if (res.status !== 200) throw new Error(`catalog-api answered ${res.status}`);
      const items = itemsOf(await res.json());
      if (!items) throw new Error('catalog-api returned no items array');
      this.rows.set(items.slice(0, 100).map(toRow));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.loading.set(false);
    }
  }
}
