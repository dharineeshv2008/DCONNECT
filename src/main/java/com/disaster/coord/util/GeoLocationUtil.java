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

    /**
     * Represents a geographical bounding box defined by min/max latitude and longitude.
     */
    public static class BoundingBox {
        private final double minLat;
        private final double maxLat;
        private final double minLon;
        private final double maxLon;

        public BoundingBox(double minLat, double maxLat, double minLon, double maxLon) {
            this.minLat = minLat;
            this.maxLat = maxLat;
            this.minLon = minLon;
            this.maxLon = maxLon;
        }

        public double getMinLat() { return minLat; }
        public double getMaxLat() { return maxLat; }
        public double getMinLon() { return minLon; }
        public double getMaxLon() { return maxLon; }

        @Override
        public String toString() {
            return String.format("BoundingBox[lat: [%.4f, %.4f], lon: [%.4f, %.4f]]", minLat, maxLat, minLon, maxLon);
        }
    }

    /**
     * Calculates an optimized spatial bounding box around a center coordinate given a radius in kilometers.
     * Used for fast indexed database queries (avoiding full table scans).
     *
     * @param lat Center latitude
     * @param lon Center longitude
     * @param radiusKm Search radius in km
     * @return BoundingBox with min/max latitude and longitude
     */
    public static BoundingBox calculateBoundingBox(double lat, double lon, double radiusKm) {
        double radLat = Math.toRadians(lat);
        double radDist = radiusKm / EARTH_RADIUS_KM;

        double minLat = Math.toDegrees(radLat - radDist);
        double maxLat = Math.toDegrees(radLat + radDist);

        double minLon;
        double maxLon;

        // Check if bounding box covers the poles
        if (minLat > -90.0 && maxLat < 90.0) {
            double deltaLon = Math.toDegrees(Math.asin(Math.sin(radDist) / Math.cos(radLat)));
            minLon = lon - deltaLon;
            maxLon = lon + deltaLon;
        } else {
            // Near poles: cover full longitude range
            minLat = Math.max(minLat, -90.0);
            maxLat = Math.min(maxLat, 90.0);
            minLon = -180.0;
            maxLon = 180.0;
        }

        return new BoundingBox(minLat, maxLat, minLon, maxLon);
    }
}
