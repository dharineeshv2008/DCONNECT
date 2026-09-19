package com.disaster.coord.service;

import com.disaster.coord.entity.Disaster;
import com.disaster.coord.entity.Notification;
import com.disaster.coord.entity.User;
import com.disaster.coord.enums.Role;
import com.disaster.coord.enums.UserStatus;
import com.disaster.coord.repository.NotificationRepository;
import com.disaster.coord.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class NotificationService {

    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);
    private final NotificationRepository notificationRepository;
    private final UserRepository userRepository;

    @Transactional
    public void notifyUser(User user, String title, String message, Disaster disaster) {
        Notification notification = Notification.builder()
                .user(user)
                .title(title)
                .message(message)
                .disaster(disaster)
                .isRead(false)
                .build();
        notificationRepository.save(notification);
        log.info("Notification sent to user {}: {}", user.getId(), title);
    }

    @Transactional
    public void notifyAllVolunteers(String title, String message, Disaster disaster) {
        List<User> volunteers = userRepository.findByRoleAndStatus(Role.VOLUNTEER, UserStatus.ACTIVE);
        for (User vol : volunteers) {
            notifyUser(vol, title, message, disaster);
        }
        log.info("Broadcasted notification to {} active volunteers.", volunteers.size());
    }

    @Transactional
    public void notifyAdmins(String title, String message, Disaster disaster) {
        List<User> admins = userRepository.findByRoleAndStatus(Role.ADMIN, UserStatus.ACTIVE);
        for (User admin : admins) {
            notifyUser(admin, title, message, disaster);
        }
    }

    @Transactional(readOnly = true)
    public List<Notification> getUserNotifications(Long userId) {
        return notificationRepository.findByUserIdOrderByCreatedAtDesc(userId);
    }

    @Transactional(readOnly = true)
    public List<Notification> getUnreadNotifications(Long userId) {
        return notificationRepository.findByUserIdAndIsReadFalseOrderByCreatedAtDesc(userId);
    }

    @Transactional
    public void markAsRead(Long notificationId) {
        notificationRepository.findById(notificationId).ifPresent(n -> {
            n.setIsRead(true);
            notificationRepository.save(n);
        });
    }
}
