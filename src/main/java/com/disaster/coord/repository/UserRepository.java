package com.disaster.coord.repository;

import com.disaster.coord.entity.User;
import com.disaster.coord.enums.Role;
import com.disaster.coord.enums.UserStatus;
import org.springframework.data.jpa.repository.JpaRepository;
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
}
