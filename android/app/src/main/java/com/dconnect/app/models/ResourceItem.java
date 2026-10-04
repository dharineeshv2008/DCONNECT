package com.dconnect.app.models;

public class ResourceItem {
    private String id;
    private String category;
    private String description;
    private int quantity;
    private String unit;
    private String status;
    private String address;
    private double latitude;
    private double longitude;
    private String phone;
    private String availableUntil;

    public ResourceItem(String id, String category, String description, int quantity, String unit,
                        String status, String address, double latitude, double longitude,
                        String phone, String availableUntil) {
        this.id = id;
        this.category = category;
        this.description = description;
        this.quantity = quantity;
        this.unit = unit;
        this.status = status;
        this.address = address;
        this.latitude = latitude;
        this.longitude = longitude;
        this.phone = phone;
        this.availableUntil = availableUntil;
    }

    public String getId() { return id; }
    public String getCategory() { return category; }
    public String getDescription() { return description; }
    public int getQuantity() { return quantity; }
    public String getUnit() { return unit; }
    public String getStatus() { return status; }
    public String getAddress() { return address; }
    public double getLatitude() { return latitude; }
    public double getLongitude() { return longitude; }
    public String getPhone() { return phone; }
    public String getAvailableUntil() { return availableUntil; }
}
