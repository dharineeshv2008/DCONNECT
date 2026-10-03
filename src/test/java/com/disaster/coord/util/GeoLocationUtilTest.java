package com.disaster.coord.util;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("Haversine Distance & Spatial Bounding Box Tests")
class GeoLocationUtilTest {

    // Chennai Central Railway Station: 13.0827, 80.2707
    private static final double CHENNAI_CENTRAL_LAT = 13.0827;
    private static final double CHENNAI_CENTRAL_LNG = 80.2707;

    // Marina Beach: 13.0500, 80.2824 (~3.8 km)
    private static final double MARINA_BEACH_LAT = 13.0500;
    private static final double MARINA_BEACH_LNG = 80.2824;

    // Tambaram: 12.9249, 80.1000 (~25.2 km)
    private static final double TAMBARAM_LAT = 12.9249;
    private static final double TAMBARAM_LNG = 80.1000;

    // Kanchipuram: 12.8342, 79.7036 (~68.5 km)
    private static final double KANCHIPURAM_LAT = 12.8342;
    private static final double KANCHIPURAM_LNG = 79.7036;

    @Test
    @DisplayName("Should accurately calculate known Haversine distance between two coordinates")
    void testCalculateDistanceKm_KnownPoints() {
        double distCentralToMarina = GeoLocationUtil.calculateDistanceKm(
                CHENNAI_CENTRAL_LAT, CHENNAI_CENTRAL_LNG,
                MARINA_BEACH_LAT, MARINA_BEACH_LNG);

        // Expected distance is ~3.87 km
        assertTrue(distCentralToMarina > 3.5 && distCentralToMarina < 4.2,
                "Distance should be around 3.8 km but was: " + distCentralToMarina);

        double distCentralToTambaram = GeoLocationUtil.calculateDistanceKm(
                CHENNAI_CENTRAL_LAT, CHENNAI_CENTRAL_LNG,
                TAMBARAM_LAT, TAMBARAM_LNG);

        // Expected distance is ~25.2 km (inside 30 km radius)
        assertTrue(distCentralToTambaram > 23.0 && distCentralToTambaram < 27.0,
                "Distance to Tambaram should be within 30km radius (~25km), was: " + distCentralToTambaram);

        double distCentralToKanchi = GeoLocationUtil.calculateDistanceKm(
                CHENNAI_CENTRAL_LAT, CHENNAI_CENTRAL_LNG,
                KANCHIPURAM_LAT, KANCHIPURAM_LNG);

        // Expected distance is ~68 km (outside 30 km radius)
        assertTrue(distCentralToKanchi > 60.0,
                "Distance to Kanchipuram should be outside 30km radius, was: " + distCentralToKanchi);
    }

    @Test
    @DisplayName("Should return 0 for identical coordinates")
    void testCalculateDistanceKm_ZeroDistance() {
        double dist = GeoLocationUtil.calculateDistanceKm(
                CHENNAI_CENTRAL_LAT, CHENNAI_CENTRAL_LNG,
                CHENNAI_CENTRAL_LAT, CHENNAI_CENTRAL_LNG);

        assertEquals(0.0, dist, 0.0001, "Distance between identical points must be zero");
    }

    @Test
    @DisplayName("Bounding box for 30 km radius must enclose all points within 30 km")
    void testCalculateBoundingBox_EnclosesRadius() {
        double radiusKm = 30.0;
        GeoLocationUtil.BoundingBox bbox = GeoLocationUtil.calculateBoundingBox(
                CHENNAI_CENTRAL_LAT, CHENNAI_CENTRAL_LNG, radiusKm);

        assertNotNull(bbox);
        assertTrue(bbox.getMinLat() < CHENNAI_CENTRAL_LAT);
        assertTrue(bbox.getMaxLat() > CHENNAI_CENTRAL_LAT);
        assertTrue(bbox.getMinLon() < CHENNAI_CENTRAL_LNG);
        assertTrue(bbox.getMaxLon() > CHENNAI_CENTRAL_LNG);

        // Point within 30km (Tambaram, ~25km) must fall inside bounding box
        assertTrue(TAMBARAM_LAT >= bbox.getMinLat() && TAMBARAM_LAT <= bbox.getMaxLat(),
                "Tambaram latitude must fall within bounding box");
        assertTrue(TAMBARAM_LNG >= bbox.getMinLon() && TAMBARAM_LNG <= bbox.getMaxLon(),
                "Tambaram longitude must fall within bounding box");

        // Point outside 30km (Kanchipuram, ~68km) must fall outside bounding box
        boolean kanchiInside = (KANCHIPURAM_LAT >= bbox.getMinLat() && KANCHIPURAM_LAT <= bbox.getMaxLat())
                && (KANCHIPURAM_LNG >= bbox.getMinLon() && KANCHIPURAM_LNG <= bbox.getMaxLon());
        assertFalse(kanchiInside, "Kanchipuram (~68km) must not fall inside 30km bounding box");
    }

    @Test
    @DisplayName("Should format distance appropriately in meters or kilometers")
    void testFormatDistance() {
        assertEquals("450 m", GeoLocationUtil.formatDistance(0.450));
        assertEquals("1.20 km", GeoLocationUtil.formatDistance(1.20));
        assertEquals("25.80 km", GeoLocationUtil.formatDistance(25.804));
    }
}
