import { Component, inject } from '@angular/core';
import { CopyButtonComponent } from './copy-button.component';
import { EnvironmentStore } from './environment.store';
import { applicationStatusLabel, lifeCycleLabel, subscriptionStatusLabel } from './format';

interface Term {
  key: string;
  meaning: string;
}

/** Page d'aide : environnements, fonctionnement du portail, lexique WSO2, marche à suivre pour publier. */
@Component({
  selector: 'app-help',
  standalone: true,
  imports: [CopyButtonComponent],
  template: `
    <div class="page-head">
      <h2>Help</h2>
      <p class="lede">How this portal works, what the statuses mean, and where to publish or subscribe.</p>
    </div>

    <section class="panel help" aria-labelledby="help-deploy">
      <h3 id="help-deploy" class="section-title">Deploy your API to WSO2</h3>
      <p>APIs are deployed from GitLab with the <strong>swagger-deploy</strong> CI/CD component.</p>
      <ol>
        <li>Describe your API in an <strong>OpenAPI (Swagger)</strong> file, kept in your Git repository.</li>
        <li>Add the <strong>swagger-deploy</strong> component to your project's <code>.gitlab-ci.yml</code>. Its documentation lists its inputs.</li>
        <li>Run the pipeline: the component deploys the API to WSO2. Start with the lowest environment, then follow your team's promotion process for the next ones.</li>
        <li>After the next synchronization your API appears here (the Overview shows when it last ran). Its page gives the URLs to call it.</li>
        <li>Consumers <strong>subscribe</strong> from the Devportal with an application, under a throttling policy. Subscriptions may need approval.</li>
      </ol>
      @if (store.portal().deployComponentUrl; as url) {
        <p>
          <a class="btn btn-primary" [href]="url" target="_blank" rel="noopener noreferrer">Open the swagger-deploy component <span class="sr-only">(new tab)</span><span aria-hidden="true">↗</span></a>
        </p>
      } @else {
        <p class="muted">The address of the component is not configured on this portal.</p>
      }
      <p class="muted">Before deprecating or retiring an API, open its page here: “Impact of a change” lists the applications and owners to warn.</p>
    </section>

    <section class="panel help" aria-labelledby="help-env">
      <h3 id="help-env" class="section-title">Environments</h3>
      <p>
        The portal shows four WSO2 API Manager environments side by side. <strong>EXP is the production environment.</strong>
      </p>
      <div class="table-wrap" tabindex="0" role="region" aria-label="Environments">
        <table class="list">
          <thead>
            <tr>
              <th scope="col">Environment</th>
              <th scope="col">Publisher</th>
              <th scope="col">Devportal</th>
              <th scope="col">Identity Server</th>
              <th scope="col">API gateways</th>
            </tr>
          </thead>
          <tbody>
            @for (env of store.environments(); track env.key) {
              <tr>
                <th scope="row">{{ env.label }}</th>
                <td>
                  @if (env.publisherUrl) {
                    <a [href]="env.publisherUrl" target="_blank" rel="noopener noreferrer">Open <span class="sr-only">{{ env.label }} Publisher (new tab)</span>↗</a>
                  } @else {
                    <span class="muted">—</span>
                  }
                </td>
                <td>
                  @if (env.devportalUrl) {
                    <a [href]="env.devportalUrl" target="_blank" rel="noopener noreferrer">Open <span class="sr-only">{{ env.label }} Devportal (new tab)</span>↗</a>
                  } @else {
                    <span class="muted">—</span>
                  }
                </td>
                <td>
                  @if (env.identityServerUrl) {
                    <span class="url mono">{{ env.identityServerUrl }}</span>
                    <app-copy-button [text]="env.identityServerUrl" [label]="env.label + ' Identity Server URL'" />
                  } @else {
                    <span class="muted">—</span>
                  }
                </td>
                <td>
                  @for (gateway of env.gateways; track gateway.name + gateway.vhost) {
                    <div class="conn-line">
                      <span class="gw-name">{{ gateway.name }}</span>
                      <span class="url mono">{{ gateway.url }}</span>
                      <app-copy-button [text]="gateway.url" [label]="env.label + ' ' + gateway.name + ' gateway URL'" />
                    </div>
                  } @empty {
                    <span class="muted">No gateway seen yet</span>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel help" aria-labelledby="help-how">
      <h3 id="help-how" class="section-title">How the data is collected</h3>
      <ul>
        <li>The portal is <strong>read-only</strong>: it never changes anything in WSO2.</li>
        <li>Data comes from periodic synchronizations of each environment, not from real-time calls. The time of the last successful synchronization is shown on the Overview.</li>
        <li>If an environment is unreachable, the portal keeps showing its last successful synchronization and says so.</li>
        <li>Press <kbd>Ctrl</kbd> + <kbd>K</kbd> (<kbd>⌘</kbd> + <kbd>K</kbd> on a Mac) to search APIs and applications from any page.</li>
      </ul>
    </section>

    <section class="panel help" aria-labelledby="help-traffic">
      <h3 id="help-traffic" class="section-title">Reading the traffic figures</h3>
      <ul>
        <li>Calls, errors and latency come from the analytics events of the API gateways, stored in <strong>Splunk</strong> and read periodically (every 30 minutes by default). They are not real time.</li>
        <li>An <strong>error</strong> is any response with a status of 400 or above: 4xx are client errors (bad request, unauthorized, throttled…), 5xx are server errors.</li>
        <li><strong>Latency p95</strong> means that 95% of the calls were faster than this value. APIs with fewer than 20 calls are left out of the “highest error rate” and “slowest” rankings.</li>
        <li>A dash means no call was recorded on the period. Figures are hidden for an environment without a Splunk source.</li>
        <li>An application is matched to the catalog by its identifier, or by its name when that name is unique in the environment: an ambiguous name is shown without a link.</li>
      </ul>
    </section>

    <section class="panel help" aria-labelledby="help-glossary">
      <h3 id="help-glossary" class="section-title">Glossary</h3>
      <div class="glossary">
        <div>
          <h4>API status</h4>
          <dl>
            @for (term of lifecycle; track term.key) {
              <dt>{{ life(term.key) }}</dt>
              <dd>{{ term.meaning }}</dd>
            }
          </dl>
        </div>
        <div>
          <h4>Subscription status</h4>
          <dl>
            @for (term of subscription; track term.key) {
              <dt>{{ sub(term.key) }}</dt>
              <dd>{{ term.meaning }}</dd>
            }
          </dl>
        </div>
        <div>
          <h4>Application status</h4>
          <dl>
            @for (term of application; track term.key) {
              <dt>{{ app(term.key) }}</dt>
              <dd>{{ term.meaning }}</dd>
            }
          </dl>
        </div>
      </div>
    </section>
  `,
})
export class HelpComponent {
  readonly store = inject(EnvironmentStore);

  readonly lifecycle: Term[] = [
    { key: 'CREATED', meaning: 'Defined but not published: not visible in the Devportal.' },
    { key: 'PROTOTYPED', meaning: 'Available for testing without a subscription.' },
    { key: 'PUBLISHED', meaning: 'Visible in the Devportal and open to subscriptions.' },
    { key: 'DEPRECATED', meaning: 'Still working, but consumers are advised to move away.' },
    { key: 'BLOCKED', meaning: 'Calls are rejected at the gateway.' },
    { key: 'RETIRED', meaning: 'Removed from the gateway and the Devportal.' },
  ];

  readonly subscription: Term[] = [
    { key: 'UNBLOCKED', meaning: 'The application can call the API.' },
    { key: 'ON_HOLD', meaning: 'Waiting for approval.' },
    { key: 'TIER_UPDATE_PENDING', meaning: 'A change of throttling policy is waiting for approval.' },
    { key: 'BLOCKED', meaning: 'Calls from this application are rejected.' },
    { key: 'PROD_ONLY_BLOCKED', meaning: 'Blocked for production keys only; sandbox keys still work.' },
    { key: 'REJECTED', meaning: 'The subscription request was refused.' },
  ];

  readonly application: Term[] = [
    { key: 'APPROVED', meaning: 'Ready to use.' },
    { key: 'CREATED', meaning: 'Created, waiting for approval.' },
    { key: 'REJECTED', meaning: 'Refused.' },
  ];

  life = lifeCycleLabel;
  sub = subscriptionStatusLabel;
  app = applicationStatusLabel;
}
