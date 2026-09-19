package com.disaster.coord.service;

import com.disaster.coord.dto.CommentDtos.*;
import com.disaster.coord.entity.Comment;
import com.disaster.coord.entity.Disaster;
import com.disaster.coord.entity.User;
import com.disaster.coord.enums.UserStatus;
import com.disaster.coord.exception.AccessDeniedException;
import com.disaster.coord.exception.ResourceNotFoundException;
import com.disaster.coord.repository.CommentRepository;
import com.disaster.coord.repository.DisasterRepository;
import com.disaster.coord.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class CommentService {

    private final CommentRepository commentRepository;
    private final DisasterRepository disasterRepository;
    private final UserRepository userRepository;

    @Transactional
    public CommentResponse addComment(Long disasterId, CommentRequest req) {
        Disaster disaster = disasterRepository.findById(disasterId)
                .orElseThrow(() -> new ResourceNotFoundException("Disaster not found with ID: " + disasterId));

        User user = userRepository.findById(req.getUserId())
                .orElseThrow(() -> new ResourceNotFoundException("User not found with ID: " + req.getUserId()));

        if (user.getStatus() == UserStatus.REJECTED || user.getStatus() == UserStatus.SUSPENDED) {
            throw new AccessDeniedException("Suspended or rejected accounts cannot post comments.");
        }

        Comment comment = Comment.builder()
                .disaster(disaster)
                .user(user)
                .message(req.getMessage().trim())
                .build();

        comment = commentRepository.save(comment);

        return CommentResponse.builder()
                .id(comment.getId())
                .disasterId(disaster.getId())
                .userId(user.getId())
                .userName(user.getName())
                .userRole(user.getRole().name())
                .message(comment.getMessage())
                .createdAt(comment.getCreatedAt())
                .build();
    }

    @Transactional(readOnly = true)
    public List<CommentResponse> getComments(Long disasterId) {
        return commentRepository.findByDisasterIdOrderByCreatedAtAsc(disasterId)
                .stream().map(c -> CommentResponse.builder()
                        .id(c.getId())
                        .disasterId(c.getDisaster().getId())
                        .userId(c.getUser().getId())
                        .userName(c.getUser().getName())
                        .userRole(c.getUser().getRole().name())
                        .message(c.getMessage())
                        .createdAt(c.getCreatedAt())
                        .build())
                .collect(Collectors.toList());
    }
}
