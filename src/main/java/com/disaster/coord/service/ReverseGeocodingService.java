package com.disaster.coord.service;

/**
 * Service for converting geographic coordinates (latitude, longitude) into
 * human-readable physical addresses.
 */
public interface ReverseGeocodingService {

    /**
     * Resolves human-readable address from geographic coordinates.
     *
     * @param latitude  Latitude in degrees
     * @param longitude Longitude in degrees
     * @return Formatted human-readable address
     */
    String getAddressFromCoordinates(double latitude, double longitude);
}
