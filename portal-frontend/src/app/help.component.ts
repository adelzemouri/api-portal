import { Component, inject } from '@angular/core';
import { CopyButtonComponent } from './copy-button.component';
import { EnvironmentStore } from './environment.store';
import { applicationStatusLabel, lifeCycleLabel, subscriptionStatusLabel } from './format';
import { TranslatePipe } from './i18n';

interface Term {
  key: string;
  meaning: string;
}

/** Page d'aide : environnements, fonctionnement du portail, lexique WSO2, marche à suivre pour publier. */
@Component({
  selector: 'app-help',
  standalone: true,
  imports: [CopyButtonComponent, TranslatePipe],
  template: `
    <div class="page-head">
      <h2>{{ 'Help' | t }}</h2>
      <p class="lede">{{ 'How this portal works, what the statuses mean, and where to publish or subscribe.' | t }}</p>
    </div>

    <section class="panel help" aria-labelledby="help-deploy">
      <h3 id="help-deploy" class="section-title">{{ 'Deploy your API to WSO2' | t }}</h3>
      <p [innerHTML]="'APIs are deployed from GitLab with the <strong>swagger-deploy</strong> CI/CD component.' | t"></p>
      <ol>
        <li [innerHTML]="'Describe your API in an <strong>OpenAPI (Swagger)</strong> file, kept in your Git repository.' | t"></li>
        <li [innerHTML]="'Add the <strong>swagger-deploy</strong> component to your project’s <code>.gitlab-ci.yml</code>. Its documentation lists its inputs.' | t"></li>
        <li [innerHTML]="'Run the pipeline: the component deploys the API to WSO2. Start with the lowest environment, then follow your team’s promotion process for the next ones.' | t"></li>
        <li [innerHTML]="'After the next synchronization your API appears here (the Overview shows when it last ran). Its page gives the URLs to call it.' | t"></li>
        <li [innerHTML]="'Consumers <strong>subscribe</strong> from the Devportal with an application, under a throttling policy. Subscriptions may need approval.' | t"></li>
      </ol>
      @if (store.portal().deployComponentUrl; as url) {
        <p>
          <a class="btn btn-primary" [href]="url" target="_blank" rel="noopener noreferrer">{{ 'Open the swagger-deploy component' | t }} <span class="sr-only">{{ '(new tab)' | t }}</span><span aria-hidden="true">↗</span></a>
        </p>
      } @else {
        <p class="muted">{{ 'The address of the component is not configured on this portal.' | t }}</p>
      }
      <p class="muted">{{ 'Before deprecating or retiring an API, open its page here: “Impact of a change” lists the applications and owners to warn.' | t }}</p>
    </section>

    <section class="panel help" aria-labelledby="help-env">
      <h3 id="help-env" class="section-title">{{ 'Environments' | t }}</h3>
      <p [innerHTML]="'The portal shows four WSO2 API Manager environments side by side. <strong>EXP is the production environment.</strong>' | t"></p>
      <div class="table-wrap" tabindex="0" role="region" [attr.aria-label]="'Environments' | t">
        <table class="list">
          <thead>
            <tr>
              <th scope="col">{{ 'Environment' | t }}</th>
              <th scope="col">Publisher</th>
              <th scope="col">Devportal</th>
              <th scope="col">Identity Server</th>
              <th scope="col">{{ 'API gateways' | t }}</th>
            </tr>
          </thead>
          <tbody>
            @for (env of store.environments(); track env.key) {
              <tr>
                <th scope="row">{{ env.label }}</th>
                <td>
                  @if (env.publisherUrl) {
                    <a [href]="env.publisherUrl" target="_blank" rel="noopener noreferrer">{{ 'Open' | t }} <span class="sr-only">{{ '{env} Publisher (new tab)' | t: { env: env.label } }}</span>↗</a>
                  } @else {
                    <span class="muted">—</span>
                  }
                </td>
                <td>
                  @if (env.devportalUrl) {
                    <a [href]="env.devportalUrl" target="_blank" rel="noopener noreferrer">{{ 'Open' | t }} <span class="sr-only">{{ '{env} Devportal (new tab)' | t: { env: env.label } }}</span>↗</a>
                  } @else {
                    <span class="muted">—</span>
                  }
                </td>
                <td>
                  @if (env.identityServerUrl) {
                    <span class="url mono">{{ env.identityServerUrl }}</span>
                    <app-copy-button [text]="env.identityServerUrl" [label]="'{env} Identity Server URL' | t: { env: env.label }" />
                  } @else {
                    <span class="muted">—</span>
                  }
                </td>
                <td>
                  @for (gateway of env.gateways; track gateway.name + gateway.vhost) {
                    <div class="conn-line">
                      <span class="gw-name">{{ gateway.name }}</span>
                      <span class="url mono">{{ gateway.url }}</span>
                      <app-copy-button [text]="gateway.url" [label]="'{env} {gateway} gateway URL' | t: { env: env.label, gateway: gateway.name }" />
                    </div>
                  } @empty {
                    <span class="muted">{{ 'No gateway seen yet' | t }}</span>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel help" aria-labelledby="help-how">
      <h3 id="help-how" class="section-title">{{ 'How the data is collected' | t }}</h3>
      <ul>
        <li [innerHTML]="'The portal is <strong>read-only</strong>: it never changes anything in WSO2.' | t"></li>
        <li [innerHTML]="'Data comes from periodic synchronizations of each environment, not from real-time calls. The time of the last successful synchronization is shown on the Overview.' | t"></li>
        <li [innerHTML]="'If an environment is unreachable, the portal keeps showing its last successful synchronization and says so.' | t"></li>
        <li [innerHTML]="'Press <kbd>Ctrl</kbd> + <kbd>K</kbd> (<kbd>⌘</kbd> + <kbd>K</kbd> on a Mac) to search APIs and applications from any page.' | t"></li>
      </ul>
    </section>

    <section class="panel help" aria-labelledby="help-traffic">
      <h3 id="help-traffic" class="section-title">{{ 'Reading the traffic figures' | t }}</h3>
      <ul>
        <li [innerHTML]="'Calls, errors and latency come from the analytics events of the API gateways, stored in <strong>Splunk</strong> and read periodically (every 30 minutes by default). They are not real time.' | t"></li>
        <li [innerHTML]="'An <strong>error</strong> is any response with a status of 400 or above: 4xx are client errors (bad request, unauthorized, throttled…), 5xx are server errors.' | t"></li>
        <li [innerHTML]="'<strong>Latency p95</strong> means that 95% of the calls were faster than this value. APIs with fewer than 20 calls are left out of the “highest error rate” and “slowest” rankings.' | t"></li>
        <li [innerHTML]="'A dash means no call was recorded on the period. Figures are hidden for an environment without a Splunk source.' | t"></li>
        <li [innerHTML]="'An application is matched to the catalog by its identifier, or by its name when that name is unique in the environment: an ambiguous name is shown without a link.' | t"></li>
      </ul>
    </section>

    <section class="panel help" aria-labelledby="help-glossary">
      <h3 id="help-glossary" class="section-title">{{ 'Glossary' | t }}</h3>
      <div class="glossary">
        <div>
          <h4>{{ 'API status' | t }}</h4>
          <dl>
            @for (term of lifecycle; track term.key) {
              <dt>{{ life(term.key) }}</dt>
              <dd>{{ term.meaning | t }}</dd>
            }
          </dl>
        </div>
        <div>
          <h4>{{ 'Subscription status' | t }}</h4>
          <dl>
            @for (term of subscription; track term.key) {
              <dt>{{ sub(term.key) }}</dt>
              <dd>{{ term.meaning | t }}</dd>
            }
          </dl>
        </div>
        <div>
          <h4>{{ 'Application status' | t }}</h4>
          <dl>
            @for (term of application; track term.key) {
              <dt>{{ app(term.key) }}</dt>
              <dd>{{ term.meaning | t }}</dd>
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
