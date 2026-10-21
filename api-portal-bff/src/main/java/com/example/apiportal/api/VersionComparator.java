package com.example.apiportal.api;

import java.util.Comparator;

/** Ordre naturel des versions d'API : 1.2 < 1.10 < 2.0 (comparaison numérique segment par segment). */
final class VersionComparator implements Comparator<String> {

    static final VersionComparator INSTANCE = new VersionComparator();

    private VersionComparator() {
    }

    @Override
    public int compare(String a, String b) {
        String[] left = a.split("[.\\-]");
        String[] right = b.split("[.\\-]");
        for (int i = 0; i < Math.min(left.length, right.length); i++) {
            int result = compareSegment(left[i], right[i]);
            if (result != 0) {
                return result;
            }
        }
        return Integer.compare(left.length, right.length);
    }

    private static int compareSegment(String a, String b) {
        if (isNumber(a) && isNumber(b)) {
            return Long.compare(Long.parseLong(a), Long.parseLong(b));
        }
        return a.compareTo(b);
    }

    private static boolean isNumber(String s) {
        return !s.isEmpty() && s.length() < 18 && s.chars().allMatch(Character::isDigit);
    }
}
