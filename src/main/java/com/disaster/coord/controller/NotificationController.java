package com.disaster.coord.controller;

import com.disaster.coord.dto.ApiResponse;
import com.disaster.coord.entity.Notification;
import com.disaster.coord.service.NotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/notifications")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class NotificationController {

    private final NotificationService notificationService;

    @GetMapping("/user/{userId}")
    public ResponseEntity<ApiResponse<List<Notification>>> getUserNotifications(@PathVariable Long userId) {
        List<Notification> list = notificationService.getUserNotifications(userId);
        return ResponseEntity.ok(ApiResponse.ok("Notifications retrieved", list));
    }

    @PatchMapping("/{id}/read")
    public ResponseEntity<ApiResponse<String>> markAsRead(@PathVariable Long id) {
        notificationService.markAsRead(id);
        return ResponseEntity.ok(ApiResponse.ok("Notification marked as read", "OK"));
    }
}
