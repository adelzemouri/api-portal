package com.example.apiportal.mock;

import com.example.apiportal.sync.CatalogSnapshot;
import com.example.apiportal.wso2.Wso2Models.ApiSummary;
import com.example.apiportal.wso2.Wso2Models.ApplicationRef;
import com.example.apiportal.wso2.Wso2Models.ApplicationSummary;
import com.example.apiportal.wso2.Wso2Models.Revision;
import com.example.apiportal.wso2.Wso2Models.RevisionDeployment;
import com.example.apiportal.wso2.Wso2Models.Subscription;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Données factices d'une banque fictive, entièrement déterministes (aucun aléa, dates fixes) : deux
 * synchros donnent le même résultat. Les noms de propriétaires sont inventés.
 *
 * <p>Scénarios volontairement présents : divergence de versions entre environnements
 * (Payments v1.3 en SIM/UAT, v1.2 en EXP), API absentes de certains environnements, plusieurs versions
 * d'une même API, API sans révision déployée, gateway interne en plus de la gateway par défaut.
 */
final class MockCatalog {

    static final List<String> ENVIRONMENTS = List.of("dev", "sim", "uat", "exp");

    private static final Instant BASE = Instant.parse("2026-01-12T08:30:00Z");
    /** Statuts de cycle de vie pour lesquels WSO2 conserve une révision déployée sur une gateway. */
    private static final Set<String> DEPLOYED_STATUSES = Set.of("PUBLISHED", "PROTOTYPED", "DEPRECATED", "BLOCKED");

    /** Une version d'API dans un environnement. {@code internalGateway} : déployée aussi sur la gateway interne. */
    private record Entry(String environment, String version, String lifeCycleStatus, boolean internalGateway) {
    }

    private record MockApi(String name, String contextBase, String type, List<Entry> entries) {
    }

    private record MockApp(String name, String owner, Set<String> environments) {
    }

    private final List<MockApi> apis = List.of(
            api("Payments", "/payments", "HTTP",
                    "dev:1.4:PUBLISHED", "sim:1.3:PUBLISHED", "sim:2.0:PROTOTYPED", "uat:1.3:PUBLISHED",
                    "exp:1.2:PUBLISHED:i", "exp:1.1:DEPRECATED"),
            api("Accounts", "/accounts", "HTTP",
                    "dev:3.1:PUBLISHED", "sim:3.0:PUBLISHED", "uat:3.0:PUBLISHED", "exp:3.0:PUBLISHED:i"),
            api("Cards", "/cards", "HTTP",
                    "dev:2.2:PUBLISHED", "sim:2.2:PUBLISHED", "uat:2.2:PUBLISHED", "exp:2.2:PUBLISHED:i"),
            api("KYC Checks", "/kyc", "HTTP", "dev:1.0:CREATED", "sim:1.0:PUBLISHED"),
            api("Transfers", "/transfers", "HTTP",
                    "dev:1.5:PUBLISHED", "sim:1.5:PUBLISHED", "uat:1.5:PUBLISHED", "exp:1.4:PUBLISHED:i"),
            api("Loans", "/loans", "HTTP", "sim:1.1:PUBLISHED", "uat:1.1:PUBLISHED", "exp:1.1:PUBLISHED"),
            api("FX Rates", "/fx-rates", "HTTP",
                    "dev:4.0:PUBLISHED", "sim:4.0:PUBLISHED", "uat:4.0:PUBLISHED", "exp:4.0:PUBLISHED"),
            api("Notifications", "/notifications", "HTTP", "dev:1.2:PUBLISHED", "sim:1.2:PUBLISHED", "exp:1.1:PUBLISHED"),
            api("Customer Profile", "/customers", "HTTP",
                    "dev:2.4:PUBLISHED", "sim:2.4:PUBLISHED", "uat:2.4:PUBLISHED", "exp:2.4:PUBLISHED:i"),
            api("Beneficiaries", "/beneficiaries", "HTTP", "dev:1.0:PUBLISHED", "sim:1.0:PUBLISHED"),
            api("Statements", "/statements", "HTTP",
                    "dev:1.7:PUBLISHED", "sim:1.7:PUBLISHED", "uat:1.7:PUBLISHED", "exp:1.6:PUBLISHED"),
            api("Fraud Scoring", "/fraud", "HTTP", "dev:0.9:PROTOTYPED"),
            api("Direct Debit", "/direct-debit", "HTTP", "sim:1.2:PUBLISHED", "uat:1.2:PUBLISHED", "exp:1.2:PUBLISHED:i"),
            api("Cheque Imaging", "/cheques", "SOAP", "dev:1.0:RETIRED", "exp:1.0:DEPRECATED"),
            api("Branch Locator", "/branches", "HTTP",
                    "dev:1.3:PUBLISHED", "sim:1.3:PUBLISHED", "uat:1.3:PUBLISHED", "exp:1.3:PUBLISHED"),
            api("Open Banking AIS", "/open-banking/ais", "HTTP",
                    "sim:3.1:PUBLISHED", "uat:3.1:PUBLISHED", "exp:3.1:PUBLISHED:i"),
            api("Audit Trail", "/audit", "HTTP",
                    "dev:1.0:PUBLISHED", "sim:1.0:PUBLISHED", "uat:1.0:PUBLISHED", "exp:1.0:PUBLISHED:i"),
            api("SWIFT Gateway", "/swift", "SOAP",
                    "dev:2.1:PUBLISHED", "sim:2.0:PUBLISHED", "uat:2.0:PUBLISHED", "exp:2.0:PUBLISHED:i"));

    private final List<MockApp> applications = List.of(
            app("Mobile Banking", "a.martin", "dev sim uat exp"),
            app("Web Banking", "s.dubois", "dev sim uat exp"),
            app("Back Office", "l.bernard", "dev sim uat exp"),
            app("Partner Gateway", "m.petit", "dev sim uat exp"),
            app("Fraud Engine", "k.durand", "dev sim uat exp"),
            app("Reporting", "n.leroy", "dev sim uat exp"),
            app("Chatbot", "c.moreau", "dev sim uat"),
            app("ATM Switch", "t.simon", "dev sim uat exp"),
            app("Treasury UI", "j.laurent", "dev sim uat exp"),
            app("Compliance Portal", "e.lefebvre", "dev sim uat exp"),
            app("Fintech A (TPP)", "p.roux", "sim uat exp"),
            app("Fintech B (TPP)", "p.roux", "sim uat"),
            app("Payroll Connector", "h.fournier", "dev sim uat exp"),
            app("CRM Sync", "o.girard", "dev sim uat exp"),
            app("Data Lake Ingest", "r.bonnet", "dev sim uat"),
            app("Card Processor", "v.dupont", "dev sim uat exp"),
            app("Branch Kiosk", "f.lambert", "dev sim"),
            app("Loan Origination", "i.fontaine", "dev sim uat exp"),
            app("Monitoring Probe", "y.rousseau", "dev sim uat exp"),
            app("Sandbox Explorer", "b.vincent", "dev"),
            app("Onboarding Wizard", "d.muller", "dev sim uat"),
            app("Notification Hub", "g.lefevre", "dev sim uat exp"),
            app("FX Desk", "z.faure", "dev sim uat exp"),
            app("SWIFT Bridge", "u.andre", "sim uat exp"),
            app("Audit Collector", "q.mercier", "dev sim uat exp"));

    CatalogSnapshot snapshotFor(String environment) {
        List<ApiSummary> summaries = new ArrayList<>();
        Map<String, List<Revision>> revisions = new LinkedHashMap<>();
        Map<String, List<Subscription>> subscriptions = new LinkedHashMap<>();

        List<ApplicationSummary> apps = applicationsFor(environment);

        int apiIndex = 0;
        for (MockApi api : apis) {
            for (Entry entry : api.entries()) {
                if (!entry.environment().equals(environment)) {
                    continue;
                }
                String id = id(environment, api.name(), entry.version());
                summaries.add(new ApiSummary(id, api.name(), api.contextBase() + "/" + entry.version(),
                        entry.version(), "svc_publisher", api.type(), entry.lifeCycleStatus()));
                revisions.put(id, revisionsFor(environment, api, entry));
                subscriptions.put(id, subscriptionsFor(environment, apiIndex, entry, apps));
                apiIndex++;
            }
        }
        return new CatalogSnapshot(summaries, revisions, subscriptions, apps);
    }

    private List<ApplicationSummary> applicationsFor(String environment) {
        List<ApplicationSummary> result = new ArrayList<>();
        for (MockApp app : applications) {
            if (app.environments().contains(environment)) {
                // « CREATED » : application en attente d'approbation, pour varier les statuts.
                boolean pending = environment.equals("dev")
                        && (app.name().equals("Sandbox Explorer") || app.name().equals("Onboarding Wizard"));
                String status = pending ? "CREATED" : "APPROVED";
                result.add(new ApplicationSummary(id(environment, "app", app.name()), app.name(), app.owner(),
                        status, null));
            }
        }
        return result;
    }

    private List<Revision> revisionsFor(String environment, MockApi api, Entry entry) {
        if (!DEPLOYED_STATUSES.contains(entry.lifeCycleStatus())) {
            return List.of();
        }
        int number = 1 + Math.floorMod((api.name() + environment + entry.version()).hashCode(), 9);
        Instant deployedAt = BASE.plus(Math.floorMod((api.name() + entry.version()).hashCode(), 60), ChronoUnit.DAYS);

        List<RevisionDeployment> gateways = new ArrayList<>();
        gateways.add(new RevisionDeployment("Default", "gw-" + environment + ".bank.internal",
                "APPROVED", deployedAt.toString()));
        if (entry.internalGateway()) {
            gateways.add(new RevisionDeployment("Internal", "gw-int-" + environment + ".bank.internal",
                    "APPROVED", deployedAt.plus(2, ChronoUnit.HOURS).toString()));
        }
        return List.of(new Revision(id(environment, api.name() + entry.version(), "rev" + number),
                "Revision " + number, deployedAt.minus(1, ChronoUnit.HOURS).toString(), gateways));
    }

    /** Règle arithmétique fixe : environ une application sur onze est abonnée à une API donnée. */
    private List<Subscription> subscriptionsFor(String environment, int apiIndex, Entry entry,
                                                List<ApplicationSummary> apps) {
        if (!DEPLOYED_STATUSES.contains(entry.lifeCycleStatus())) {
            return List.of();
        }
        String[] policies = {"Gold", "Silver", "Bronze", "Unlimited"};
        List<Subscription> result = new ArrayList<>();
        for (int a = 0; a < apps.size(); a++) {
            if ((a * 5 + apiIndex * 3) % 11 != 0) {
                continue;
            }
            ApplicationSummary app = apps.get(a);
            String status = (a + apiIndex) % 13 == 0 ? "BLOCKED" : (a + apiIndex) % 7 == 0 ? "ON_HOLD" : "UNBLOCKED";
            result.add(new Subscription(id(environment, "sub" + apiIndex, app.name()),
                    new ApplicationRef(app.applicationId(), app.name(), app.owner()),
                    policies[(a + apiIndex) % policies.length], status));
        }
        return result;
    }

    private static String id(String environment, String scope, String name) {
        return UUID.nameUUIDFromBytes((environment + "/" + scope + "/" + name).getBytes(StandardCharsets.UTF_8))
                .toString();
    }

    /** Format des entrées : {@code env:version:STATUT[:i]} (i = gateway interne en plus). */
    private static MockApi api(String name, String contextBase, String type, String... specs) {
        List<Entry> entries = new ArrayList<>();
        for (String spec : specs) {
            String[] part = spec.split(":");
            entries.add(new Entry(part[0], part[1], part[2], part.length > 3 && part[3].equals("i")));
        }
        return new MockApi(name, contextBase, type, List.copyOf(entries));
    }

    private static MockApp app(String name, String owner, String environments) {
        return new MockApp(name, owner, Set.of(environments.split(" ")));
    }
}
