package com.dconnect.app.models;

public class VolunteerItem {
    private String id;
    private String name;
    private String phone;
    private String skills;
    private String availabilityStatus;
    private String organizationName;

    public VolunteerItem(String id, String name, String phone, String skills, String availabilityStatus, String organizationName) {
        this.id = id;
        this.name = name;
        this.phone = phone;
        this.skills = skills;
        this.availabilityStatus = availabilityStatus;
        this.organizationName = organizationName;
    }

    public String getId() { return id; }
    public String getName() { return name; }
    public String getPhone() { return phone; }
    public String getSkills() { return skills; }
    public String getAvailabilityStatus() { return availabilityStatus; }
    public String getOrganizationName() { return organizationName; }
}
