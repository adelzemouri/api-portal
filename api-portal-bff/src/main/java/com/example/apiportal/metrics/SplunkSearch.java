package com.example.apiportal.metrics;

import java.util.List;
import java.util.Map;

/** Une recherche Splunk : la requête SPL, les bornes de temps, les lignes de résultat (valeurs en texte, comme Splunk). */
public interface SplunkSearch {

    List<Map<String, String>> search(String spl, String earliest, String latest);
}
