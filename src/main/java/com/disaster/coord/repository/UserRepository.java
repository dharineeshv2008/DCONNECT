package com.disaster.coord.repository;

import com.disaster.coord.entity.User;
import com.disaster.coord.enums.Role;
import com.disaster.coord.enums.UserStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByPhone(String phone);
    boolean existsByPhone(String phone);
    List<User> findByRoleAndStatus(Role role, UserStatus status);
    List<User> findByStatus(UserStatus status);
    List<User> findByRoleInAndStatus(List<Role> roles, UserStatus status);
    long countByRole(Role role);
    long countByStatus(UserStatus status);

    @Query("SELECT u FROM User u WHERE u.fcmToken IS NOT NULL AND u.homeLat IS NOT NULL AND u.homeLng IS NOT NULL " +
           "AND u.homeLat BETWEEN :minLat AND :maxLat AND u.homeLng BETWEEN :minLon AND :maxLon")
    List<User> findUsersInBoundingBox(@Param("minLat") Double minLat,
                                      @Param("maxLat") Double maxLat,
                                      @Param("minLon") Double minLon,
                                      @Param("maxLon") Double maxLon);
}
