package com.disaster.coord.service;

import com.disaster.coord.dto.ResourceDtos.*;
import com.disaster.coord.entity.Disaster;
import com.disaster.coord.entity.ResourceItem;
import com.disaster.coord.entity.User;
import com.disaster.coord.enums.UserStatus;
import com.disaster.coord.exception.AccountPendingException;
import com.disaster.coord.exception.ResourceNotFoundException;
import com.disaster.coord.repository.DisasterRepository;
import com.disaster.coord.repository.ResourceRepository;
import com.disaster.coord.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ResourceService {

    private final ResourceRepository resourceRepository;
    private final UserRepository userRepository;
    private final DisasterRepository disasterRepository;
    private final NotificationService notificationService;

    @Transactional
    public ResourceResponse addResource(ResourceRequest req) {
        User provider = userRepository.findById(req.getProviderId())
                .orElseThrow(() -> new ResourceNotFoundException("Provider not found with ID: " + req.getProviderId()));

        if (provider.getStatus() == UserStatus.PENDING_APPROVAL) {
            throw new AccountPendingException("Your organization account is pending Admin approval before offering resources.");
        }

        Disaster disaster = null;
        if (req.getDisasterId() != null) {
            disaster = disasterRepository.findById(req.getDisasterId())
                    .orElseThrow(() -> new ResourceNotFoundException("Disaster not found with ID: " + req.getDisasterId()));
        }

        ResourceItem resource = ResourceItem.builder()
                .disaster(disaster)
                .provider(provider)
                .resourceType(req.getResourceType())
                .resourceName(req.getResourceName())
                .quantity(req.getQuantity())
                .unit(req.getUnit())
                .status("AVAILABLE")
                .contactPhone(req.getContactPhone() != null ? req.getContactPhone() : provider.getPhone())
                .build();

        resource = resourceRepository.save(resource);

        if (disaster != null) {
            notificationService.notifyAllVolunteers(
                    "Emergency Resources Added",
                    String.format("%s provided %d %s of '%s' for disaster '%s'.",
                            provider.getName(), resource.getQuantity(), resource.getUnit(), resource.getResourceName(), disaster.getTitle()),
                    disaster
            );
        }

        return mapToResponse(resource);
    }

    @Transactional(readOnly = true)
    public List<ResourceResponse> getResourcesByDisaster(Long disasterId) {
        return resourceRepository.findByDisasterIdOrderByCreatedAtDesc(disasterId)
                .stream().map(this::mapToResponse).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<ResourceResponse> getAllResources() {
        return resourceRepository.findAll().stream().map(this::mapToResponse).collect(Collectors.toList());
    }

    @Transactional
    public ResourceResponse updateResourceStatus(Long resourceId, String status) {
        ResourceItem item = resourceRepository.findById(resourceId)
                .orElseThrow(() -> new ResourceNotFoundException("Resource not found with ID: " + resourceId));

        item.setStatus(status.toUpperCase());
        item = resourceRepository.save(item);
        return mapToResponse(item);
    }

    private ResourceResponse mapToResponse(ResourceItem item) {
        return ResourceResponse.builder()
                .id(item.getId())
                .disasterId(item.getDisaster() != null ? item.getDisaster().getId() : null)
                .disasterTitle(item.getDisaster() != null ? item.getDisaster().getTitle() : "General Emergency Pool")
                .providerId(item.getProvider().getId())
                .providerName(item.getProvider().getName())
                .providerRole(item.getProvider().getRole().name())
                .resourceType(item.getResourceType())
                .resourceName(item.getResourceName())
                .quantity(item.getQuantity())
                .unit(item.getUnit())
                .status(item.getStatus())
                .contactPhone(item.getContactPhone())
                .createdAt(item.getCreatedAt())
                .build();
    }
}
