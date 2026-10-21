package com.example.apiportal.sync;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.apiportal.wso2.Wso2Client;
import com.example.apiportal.wso2.Wso2ClientException;
import com.example.apiportal.wso2.Wso2Models.ApiSummary;
import com.example.apiportal.wso2.Wso2Models.ApplicationRef;
import com.example.apiportal.wso2.Wso2Models.ApplicationSummary;
import com.example.apiportal.wso2.Wso2Models.Revision;
import com.example.apiportal.wso2.Wso2Models.Subscription;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** Wso2Client est déjà testé de bout en bout avec MockRestServiceServer : ici on vérifie l'assemblage. */
class Wso2CatalogSourceTest {

    private final Wso2Client client = mock(Wso2Client.class);
    private final Wso2CatalogSource source = new Wso2CatalogSource(client);

    private static final ApiSummary API_1 = new ApiSummary("a1", "Payments", "/p/1.0", "1.0", "admin", "HTTP", "PUBLISHED");
    private static final ApiSummary API_2 = new ApiSummary("a2", "Accounts", "/a/1.0", "1.0", "admin", "HTTP", "PUBLISHED");

    @BeforeEach
    void setUp() {
        when(client.environment()).thenReturn("dev");
        when(client.label()).thenReturn("DEV");
    }

    @Test
    @DisplayName("l'environnement et le libellé viennent du client")
    void delegatesEnvironmentAndLabel() {
        assertThat(source.environment()).isEqualTo("dev");
        assertThat(source.label()).isEqualTo("DEV");
    }

    @Test
    @DisplayName("N+1 : révisions et souscriptions sont lues pour chaque API, indexées par apiId")
    void fetchesRevisionsAndSubscriptionsPerApi() {
        Revision revision = new Revision("r1", "Revision 1", "2026-01-01T00:00:00Z", List.of());
        Subscription subscription = new Subscription("s1", new ApplicationRef("app1", "Mobile", "jdoe"), "Gold", "UNBLOCKED");
        ApplicationSummary application = new ApplicationSummary("app1", "Mobile", "jdoe", "APPROVED", null);
        when(client.listApis()).thenReturn(List.of(API_1, API_2));
        when(client.listDeployedRevisions("a1")).thenReturn(List.of(revision));
        when(client.listDeployedRevisions("a2")).thenReturn(List.of());
        when(client.listSubscriptions("a1")).thenReturn(List.of(subscription));
        when(client.listSubscriptions("a2")).thenReturn(List.of());
        when(client.listApplications()).thenReturn(List.of(application));

        CatalogSnapshot snapshot = source.fetch();

        assertThat(snapshot.apis()).containsExactly(API_1, API_2);
        assertThat(snapshot.revisionsOf("a1")).containsExactly(revision);
        assertThat(snapshot.revisionsOf("a2")).isEmpty();
        assertThat(snapshot.subscriptionsOf("a1")).containsExactly(subscription);
        assertThat(snapshot.applications()).containsExactly(application);
        assertThat(snapshot.subscriptionCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("tout ou rien : si un appel échoue, l'environnement échoue en bloc, sans résultat partiel")
    void failsAsAWholeWhenOneCallFails() {
        when(client.listApis()).thenReturn(List.of(API_1, API_2));
        when(client.listDeployedRevisions("a1")).thenReturn(List.of());
        when(client.listSubscriptions("a1")).thenReturn(List.of());
        when(client.listDeployedRevisions("a2")).thenThrow(new Wso2ClientException("dev", "HTTP 500"));

        assertThatThrownBy(source::fetch)
                .isInstanceOf(Wso2ClientException.class)
                .hasMessage("[dev] HTTP 500");
        verify(client, never()).listApplications();
    }

    @Test
    @DisplayName("un environnement sans API donne un instantané vide mais valide")
    void emptyEnvironment() {
        when(client.listApis()).thenReturn(List.of());
        when(client.listApplications()).thenReturn(List.of());

        CatalogSnapshot snapshot = source.fetch();

        assertThat(snapshot.apis()).isEmpty();
        assertThat(snapshot.subscriptionCount()).isZero();
    }
}
