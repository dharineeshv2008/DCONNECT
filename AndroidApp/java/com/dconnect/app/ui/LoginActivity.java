package com.dconnect.app.ui;

import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;

import com.dconnect.app.R;
import com.dconnect.app.network.ApiClient;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.gson.JsonObject;

/**
 * Login & Registration Activity matching the Web Application UI.
 *
 * Handles:
 * 1. Role Selection (USER, VOLUNTEER, NGO, GOVERNMENT_AGENCY, ADMIN)
 * 2. Login & Registration API Calls
 * 3. REAL FCM Device Token generation & backend registration (POST /api/save-device-token)
 * 4. Triggering Welcome Push Notification & Navigation to Dashboard Tabs
 */
public class LoginActivity extends AppCompatActivity {

    private static final String TAG = "DConnect_Login";

    private RadioGroup roleRadioGroup;
    private TextView textRoleHint;
    private EditText editLoginPhone, editLoginPassword;
    private Button btnLoginSubmit;
    private TextView textRegisterLink;

    private String selectedRole = "USER";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Check if session already exists
        SharedPreferences prefs = getSharedPreferences("dconnect_prefs", MODE_PRIVATE);
        if (!prefs.getString("user_id", "").isEmpty()) {
            startActivity(new Intent(this, DashboardActivity.class));
            finish();
            return;
        }

        setContentView(R.layout.activity_login);

        roleRadioGroup = findViewById(R.id.roleRadioGroup);
        textRoleHint = findViewById(R.id.textRoleHint);
        editLoginPhone = findViewById(R.id.editLoginPhone);
        editLoginPassword = findViewById(R.id.editLoginPassword);
        btnLoginSubmit = findViewById(R.id.btnLoginSubmit);
        textRegisterLink = findViewById(R.id.textRegisterLink);

        setupRoleRadioGroup();

        btnLoginSubmit.setOnClickListener(v -> handleLogin());
        textRegisterLink.setOnClickListener(v -> openRegisterDialog());
    }

    private void setupRoleRadioGroup() {
        roleRadioGroup.setOnCheckedChangeListener((group, checkedId) -> {
            if (checkedId == R.id.roleVolunteer) {
                selectedRole = "VOLUNTEER";
                textRoleHint.setText("🦺 Volunteer Mission & Relief Response Portal");
            } else if (checkedId == R.id.roleNgo) {
                selectedRole = "NGO";
                textRoleHint.setText("👥 NGO Organization Supply & Resource Operations");
            } else if (checkedId == R.id.roleGov) {
                selectedRole = "GOVERNMENT_AGENCY";
                textRoleHint.setText("🏛️ Government Disaster Authority Command");
            } else if (checkedId == R.id.roleAdmin) {
                selectedRole = "ADMIN";
                textRoleHint.setText("⚙️ Admin Incident Management & System Control");
            } else {
                selectedRole = "USER";
                textRoleHint.setText("👤 Citizen Reporting & Public Safety Network");
            }
        });
    }

    private void handleLogin() {
        String phone = editLoginPhone.getText().toString().trim();
        String password = editLoginPassword.getText().toString().trim();

        if (phone.length() != 10) {
            Toast.makeText(this, "Please enter a valid 10-digit phone number", Toast.LENGTH_SHORT).show();
            return;
        }
        if (password.isEmpty()) {
            Toast.makeText(this, "Please enter your password", Toast.LENGTH_SHORT).show();
            return;
        }

        btnLoginSubmit.setEnabled(false);
        btnLoginSubmit.setText("Authenticating...");

        ApiClient.loginUser(phone, password, selectedRole, new ApiClient.ApiCallback() {
            @Override
            public void onSuccess(String responseText) {
                runOnUiThread(() -> processAuthResponse(responseText));
            }

            @Override
            public void onError(String errorMessage) {
                runOnUiThread(() -> {
                    btnLoginSubmit.setEnabled(true);
                    btnLoginSubmit.setText("LOGIN ➔");
                    Toast.makeText(LoginActivity.this, "Authentication Failed: " + errorMessage, Toast.LENGTH_LONG).show();
                });
            }
        });
    }

    private void openRegisterDialog() {
        AlertDialog.Builder builder = new AlertDialog.Builder(this);
        View dialogView = LayoutInflater.from(this).inflate(R.layout.dialog_register, null);

        Spinner spinnerRegRole = dialogView.findViewById(R.id.spinnerRegRole);
        EditText editRegName = dialogView.findViewById(R.id.editRegName);
        EditText editRegPhone = dialogView.findViewById(R.id.editRegPhone);
        EditText editRegPassword = dialogView.findViewById(R.id.editRegPassword);
        EditText editRegOrgName = dialogView.findViewById(R.id.editRegOrgName);
        EditText editRegOrgNo = dialogView.findViewById(R.id.editRegOrgNo);
        EditText editRegSkills = dialogView.findViewById(R.id.editRegSkills);
        Button btnSubmitRegister = dialogView.findViewById(R.id.btnSubmitRegister);

        String[] roles = {"USER", "VOLUNTEER", "NGO", "GOVERNMENT_AGENCY", "ADMIN"};
        ArrayAdapter<String> roleAdapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_item, roles);
        roleAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerRegRole.setAdapter(roleAdapter);

        builder.setView(dialogView);
        AlertDialog dialog = builder.create();

        btnSubmitRegister.setOnClickListener(v -> {
            String role = spinnerRegRole.getSelectedItem() != null ? spinnerRegRole.getSelectedItem().toString() : "USER";
            String name = editRegName.getText().toString().trim();
            String phone = editRegPhone.getText().toString().trim();
            String password = editRegPassword.getText().toString().trim();
            String orgName = editRegOrgName.getText().toString().trim();
            String orgRegNo = editRegOrgNo.getText().toString().trim();
            String skills = editRegSkills.getText().toString().trim();

            if (name.isEmpty() || phone.length() != 10 || password.isEmpty()) {
                Toast.makeText(LoginActivity.this, "Please enter name, 10-digit phone, and password", Toast.LENGTH_SHORT).show();
                return;
            }

            btnSubmitRegister.setEnabled(false);
            btnSubmitRegister.setText("Creating Account...");

            ApiClient.registerUser(name, phone, password, role, orgName, orgRegNo, skills, new ApiClient.ApiCallback() {
                @Override
                public void onSuccess(String responseText) {
                    runOnUiThread(() -> {
                        dialog.dismiss();
                        processAuthResponse(responseText);
                    });
                }

                @Override
                public void onError(String errorMessage) {
                    runOnUiThread(() -> {
                        btnSubmitRegister.setEnabled(true);
                        btnSubmitRegister.setText("CREATE ACCOUNT");
                        Toast.makeText(LoginActivity.this, "Registration Failed: " + errorMessage, Toast.LENGTH_LONG).show();
                    });
                }
            });
        });

        dialog.show();
    }

    private void processAuthResponse(String jsonResponse) {
        String userId = "1";
        String userName = "User";
        String userRole = selectedRole;
        String userToken = "";

        try {
            JsonObject root = ApiClient.GSON.fromJson(jsonResponse, JsonObject.class);
            if (root.has("data") && root.get("data").isJsonObject()) {
                JsonObject data = root.getAsJsonObject("data");
                if (data.has("id")) userId = data.get("id").getAsString();
                if (data.has("name")) userName = data.get("name").getAsString();
                if (data.has("role")) userRole = data.get("role").getAsString();
                if (data.has("token")) userToken = data.get("token").getAsString();
            }
        } catch (Exception e) {
            Log.w(TAG, "Error parsing auth response: " + e.getMessage());
        }

        // Save session locally
        SharedPreferences prefs = getSharedPreferences("dconnect_prefs", MODE_PRIVATE);
        prefs.edit()
                .putString("user_id", userId)
                .putString("user_name", userName)
                .putString("user_role", userRole)
                .putString("token", userToken)
                .apply();

        Toast.makeText(this, "Welcome " + userName + "! Registering FCM token...", Toast.LENGTH_SHORT).show();

        // Fetch REAL FCM token and send to backend
        final String finalUserId = userId;
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            if (task.isSuccessful() && task.getResult() != null) {
                String fcmToken = task.getResult();
                Log.d(TAG, "🔑 REAL FCM TOKEN GENERATED: " + fcmToken);

                // Send to POST /api/save-device-token
                ApiClient.sendDeviceTokenToBackend(getApplicationContext(), finalUserId, fcmToken, new ApiClient.ApiCallback() {
                    @Override
                    public void onSuccess(String responseMessage) {
                        Log.i(TAG, "✅ Device token saved & welcome notification triggered!");
                    }

                    @Override
                    public void onError(String errorMessage) {
                        Log.w(TAG, "⚠️ Device token save warning: " + errorMessage);
                    }
                });
            }

            // Launch Dashboard Activity
            startActivity(new Intent(LoginActivity.this, DashboardActivity.class));
            finish();
        });
    }
}
