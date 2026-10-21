package com.example.apiportal.sync;

import com.example.apiportal.wso2.Wso2Client;
import com.example.apiportal.wso2.Wso2Models.ApiSummary;
import com.example.apiportal.wso2.Wso2Models.Revision;
import com.example.apiportal.wso2.Wso2Models.Subscription;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Source réelle : un control plane WSO2 APIM 4.x, lu en lecture seule via {@link Wso2Client}. */
public final class Wso2CatalogSource implements CatalogSource {

    private final Wso2Client client;

    public Wso2CatalogSource(Wso2Client client) {
        this.client = client;
    }

    @Override
    public String environment() {
        return client.environment();
    }

    @Override
    public String label() {
        return client.label();
    }

    /**
     * N+1 appels par environnement (révisions et souscriptions sont exposées par API), volontairement
     * séquentiels pour ne pas surcharger le control plane. Si un appel échoue, tout l'environnement échoue.
     */
    @Override
    public CatalogSnapshot fetch() {
        List<ApiSummary> apis = client.listApis();
        Map<String, List<Revision>> revisions = new LinkedHashMap<>();
        Map<String, List<Subscription>> subscriptions = new LinkedHashMap<>();
        for (ApiSummary api : apis) {
            if (api.id() == null) {
                continue;
            }
            revisions.put(api.id(), client.listDeployedRevisions(api.id()));
            subscriptions.put(api.id(), client.listSubscriptions(api.id()));
        }
        return new CatalogSnapshot(apis, revisions, subscriptions, client.listApplications());
    }
}
