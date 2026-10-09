import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { loadConfig } from './config';
import { isProbeRequest, originAllowed, Probe, runProbe, ZooConfig } from './probe';

// Loaded by the panel in a hidden iframe: on {type:"zoo-probe"} from an
// allowlisted parent origin it runs the browser CORS checks and posts the
// result back to that origin only. Opened directly, it runs once and shows it.
@Component({
  selector: 'app-selftest',
  template: `<h1>Self test</h1>
    @if (error()) { <p class="bad">{{ error() }}</p> }
    @if (probe(); as p) {
      <p [class]="p.ok ? 'ok' : 'bad'">{{ p.ok ? 'All checks passed' : 'Some checks failed' }} in {{ p.ms }} ms</p>
      <table>
        @for (c of p.checks; track c.id) {
          <tr><td [class]="c.ok ? 'ok' : 'bad'">{{ c.ok ? 'ok' : 'fail' }}</td><td>{{ c.label }}</td><td>{{ c.ms }} ms</td><td>{{ c.detail || c.error }}</td></tr>
        }
      </table>
      <pre>{{ json(p) }}</pre>
    } @else if (!error()) {
      <p>Running...</p>
    }`,
})
export class SelftestPage implements OnInit, OnDestroy {
  probe = signal<Probe | null>(null);
  error = signal('');
  private running: Promise<Probe> | null = null;
  private readonly onMessage = (e: MessageEvent) => void this.handle(e);

  json(p: Probe): string {
    return JSON.stringify(p, null, 2);
  }

  async ngOnInit(): Promise<void> {
    window.addEventListener('message', this.onMessage);
    if (window.parent === window) {
      try {
        await this.run(await loadConfig());
      } catch (err) {
        this.error.set(String(err));
      }
    }
  }

  ngOnDestroy(): void {
    window.removeEventListener('message', this.onMessage);
  }

  private run(config: ZooConfig): Promise<Probe> {
    this.running ??= runProbe(config, location.hostname, (url, init) => fetch(url, init))
      .then((p) => {
        this.probe.set(p);
        return p;
      })
      .finally(() => (this.running = null));
    return this.running;
  }

  private async handle(e: MessageEvent): Promise<void> {
    if (e.source !== window.parent || window.parent === window || !isProbeRequest(e.data)) return;
    const config = await loadConfig();
    if (!originAllowed(e.origin, config.panel_origins)) {
      this.error.set(`ignored a probe request from ${e.origin}: not in ZOO_PANEL_ORIGIN`);
      return;
    }
    const probe = await this.run(config);
    window.parent.postMessage({ type: 'zoo-probe-result', probe }, e.origin);
  }
}
