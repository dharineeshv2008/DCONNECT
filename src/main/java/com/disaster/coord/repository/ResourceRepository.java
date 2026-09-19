package com.disaster.coord.repository;

import com.disaster.coord.entity.ResourceItem;
import com.disaster.coord.enums.ResourceType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ResourceRepository extends JpaRepository<ResourceItem, Long> {
    List<ResourceItem> findByDisasterIdOrderByCreatedAtDesc(Long disasterId);
    List<ResourceItem> findByResourceType(ResourceType resourceType);
    List<ResourceItem> findByProviderIdOrderByCreatedAtDesc(Long providerId);
    List<ResourceItem> findByStatus(String status);
    long countByStatus(String status);
}
