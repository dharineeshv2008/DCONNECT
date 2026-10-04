package com.dconnect.app.models;

public class DisasterItem {
    private String id;
    private String title;
    private String type;
    private String status;
    private String description;
    private String locationName;
    private double latitude;
    private double longitude;
    private String reporterName;
    private String reporterRole;
    private int aggregatedCount;
    private String createdAt;

    public DisasterItem(String id, String title, String type, String status, String description,
                        String locationName, double latitude, double longitude,
                        String reporterName, String reporterRole, int aggregatedCount, String createdAt) {
        this.id = id;
        this.title = title;
        this.type = type;
        this.status = status;
        this.description = description;
        this.locationName = locationName;
        this.latitude = latitude;
        this.longitude = longitude;
        this.reporterName = reporterName;
        this.reporterRole = reporterRole;
        this.aggregatedCount = aggregatedCount;
        this.createdAt = createdAt;
    }

    public String getId() { return id; }
    public String getTitle() { return title; }
    public String getType() { return type; }
    public String getStatus() { return status; }
    public String getDescription() { return description; }
    public String getLocationName() { return locationName; }
    public double getLatitude() { return latitude; }
    public double getLongitude() { return longitude; }
    public String getReporterName() { return reporterName; }
    public String getReporterRole() { return reporterRole; }
    public int getAggregatedCount() { return aggregatedCount; }
    public String getCreatedAt() { return createdAt; }
}
