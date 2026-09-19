package com.disaster.coord.util;

/**
 * High-precision Geographical and Haversine Distance Calculations.
 * Uses Earth radius = 6371.0 km (WGS84 spherical mean radius).
 */
public final class GeoLocationUtil {

    private static final double EARTH_RADIUS_KM = 6371.0;

    private GeoLocationUtil() {
        // Prevent instantiation
    }

    /**
     * Calculates the great-circle distance between two geographic coordinates using the Haversine formula.
     *
     * @param lat1 Latitude of point 1 in degrees
     * @param lon1 Longitude of point 1 in degrees
     * @param lat2 Latitude of point 2 in degrees
     * @param lon2 Longitude of point 2 in degrees
     * @return Distance in kilometers
     */
    public static double calculateDistanceKm(double lat1, double lon1, double lat2, double lon2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);

        double rLat1 = Math.toRadians(lat1);
        double rLat2 = Math.toRadians(lat2);

        double a = Math.sin(dLat / 2.0) * Math.sin(dLat / 2.0) +
                   Math.cos(rLat1) * Math.cos(rLat2) *
                   Math.sin(dLon / 2.0) * Math.sin(dLon / 2.0);

        double c = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(1.0 - a));

        return EARTH_RADIUS_KM * c;
    }

    /**
     * Formats distance into a human-friendly string (e.g. "1.2 km" or "450 m").
     */
    public static String formatDistance(double distanceKm) {
        if (distanceKm < 1.0) {
            return String.format("%.0f m", distanceKm * 1000.0);
        }
        return String.format("%.2f km", distanceKm);
    }
}
