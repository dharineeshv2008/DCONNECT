package com.dconnect.app.models;

public class UserSession {
    private String id;
    private String name;
    private String phone;
    private String role;
    private String token;
    private boolean approved;

    public UserSession(String id, String name, String phone, String role, String token, boolean approved) {
        this.id = id;
        this.name = name;
        this.phone = phone;
        this.role = role;
        this.token = token;
        this.approved = approved;
    }

    public String getId() { return id; }
    public String getName() { return name; }
    public String getPhone() { return phone; }
    public String getRole() { return role; }
    public String getToken() { return token; }
    public boolean isApproved() { return approved; }
}
