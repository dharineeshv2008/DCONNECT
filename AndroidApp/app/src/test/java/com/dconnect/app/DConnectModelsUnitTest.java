package com.dconnect.app;

import com.dconnect.app.models.DisasterItem;
import com.dconnect.app.models.ResourceItem;
import com.dconnect.app.models.VolunteerItem;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.junit.runners.JUnit4;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

@RunWith(JUnit4.class)
public class DConnectModelsUnitTest {

    @Test
    public void testDisasterItemGetters() {
        DisasterItem disaster = new DisasterItem(
                "d1", "Severe Flood Alert", "FLOOD", "ACTIVE", "Flood in coastal region",
                "Chennai", 13.0827, 80.2707, "John Doe", "CITIZEN", 3, "2026-10-04T10:00:00Z"
        );

        assertEquals("d1", disaster.getId());
        assertEquals("Severe Flood Alert", disaster.getTitle());
        assertEquals("FLOOD", disaster.getType());
        assertEquals("ACTIVE", disaster.getStatus());
        assertEquals("Chennai", disaster.getLocationName());
        assertEquals(13.0827, disaster.getLatitude(), 0.0001);
        assertEquals(80.2707, disaster.getLongitude(), 0.0001);
        assertEquals(3, disaster.getAggregatedCount());
    }

    @Test
    public void testResourceItemGetters() {
        ResourceItem resource = new ResourceItem(
                "r1", "Food & Water", "500 Water Bottles", 500, "Packets",
                "AVAILABLE", "Emergency Hub A", 13.05, 80.25, "9876543210", "2026-10-05T00:00:00Z"
        );

        assertEquals("r1", resource.getId());
        assertEquals("Food & Water", resource.getCategory());
        assertEquals(500, resource.getQuantity());
        assertEquals("AVAILABLE", resource.getStatus());
        assertEquals("9876543210", resource.getPhone());
    }

    @Test
    public void testVolunteerItemGetters() {
        VolunteerItem volunteer = new VolunteerItem(
                "v1", "Dr. John Doe", "9876543210", "Medical, Search & Rescue", "AVAILABLE", "Red Cross"
        );

        assertEquals("v1", volunteer.getId());
        assertEquals("Dr. John Doe", volunteer.getName());
        assertEquals("AVAILABLE", volunteer.getAvailabilityStatus());
        assertTrue(volunteer.getSkills().contains("Medical"));
    }
}
