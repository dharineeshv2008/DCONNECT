package com.disaster.coord.controller;

import com.disaster.coord.dto.ApiResponse;
import com.disaster.coord.dto.CommentDtos.*;
import com.disaster.coord.service.CommentService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/disasters/{disasterId}/comments")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class CommentController {

    private final CommentService commentService;

    @PostMapping
    public ResponseEntity<ApiResponse<CommentResponse>> addComment(
            @PathVariable Long disasterId,
            @Valid @RequestBody CommentRequest request) {
        CommentResponse response = commentService.addComment(disasterId, request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok("Comment posted successfully", response));
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<CommentResponse>>> getComments(@PathVariable Long disasterId) {
        List<CommentResponse> comments = commentService.getComments(disasterId);
        return ResponseEntity.ok(ApiResponse.ok("Comments retrieved", comments));
    }
}
