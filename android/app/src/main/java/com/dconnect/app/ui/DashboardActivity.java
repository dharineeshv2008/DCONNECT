package com.dconnect.app.ui;

import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.fragment.app.Fragment;
import androidx.fragment.app.FragmentActivity;
import androidx.viewpager2.adapter.FragmentStateAdapter;
import androidx.viewpager2.widget.ViewPager2;

import com.dconnect.app.R;
import com.dconnect.app.ui.fragments.AdminControlCenterFragment;
import com.dconnect.app.ui.fragments.EmergencyResourcesFragment;
import com.dconnect.app.ui.fragments.LiveDisastersFragment;
import com.dconnect.app.ui.fragments.ReportIncidentFragment;
import com.dconnect.app.ui.fragments.VolunteerMissionsFragment;
import com.google.android.material.tabs.TabLayout;
import com.google.android.material.tabs.TabLayoutMediator;

import java.util.ArrayList;
import java.util.List;

/**
 * Native Android Dashboard Activity.
 * Contains Header (D-Connect logo, User Name, Logout) and Top TabLayout + ViewPager2 with 5 Fragments:
 * 1. Live Disasters
 * 2. Report Incidents
 * 3. Volunteer Missions
 * 4. Emergency Resources
 * 5. Admin Control Center (ONLY visible for admin users)
 */
public class DashboardActivity extends AppCompatActivity {

    private static final String TAG = "DConnect_Dashboard";

    private TextView headerUserRole, headerUserName;
    private Button btnHeaderLogout;
    private TabLayout topTabLayout;
    private ViewPager2 viewPagerDashboard;

    private boolean isAdmin = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_dashboard);

        headerUserRole = findViewById(R.id.headerUserRole);
        headerUserName = findViewById(R.id.headerUserName);
        btnHeaderLogout = findViewById(R.id.btnHeaderLogout);
        topTabLayout = findViewById(R.id.topTabLayout);
        viewPagerDashboard = findViewById(R.id.viewPagerDashboard);

        // Load Session Info
        SharedPreferences prefs = getSharedPreferences("dconnect_prefs", MODE_PRIVATE);
        String name = prefs.getString("user_name", "User");
        String role = prefs.getString("user_role", "USER");

        headerUserName.setText(name);
        headerUserRole.setText(role);

        isAdmin = "ADMIN".equalsIgnoreCase(role);

        btnHeaderLogout.setOnClickListener(v -> logout());

        setupViewPagerAndTabs();
    }

    private void setupViewPagerAndTabs() {
        List<Fragment> fragmentList = new ArrayList<>();
        List<String> titleList = new ArrayList<>();

        // 1. Live Disasters
        fragmentList.add(new LiveDisastersFragment());
        titleList.add("📡 Live Disasters");

        // 2. Report Incidents
        fragmentList.add(new ReportIncidentFragment());
        titleList.add("⚠️ Report Incidents");

        // 3. Volunteer Missions
        fragmentList.add(new VolunteerMissionsFragment());
        titleList.add("🤝 Volunteer Missions");

        // 4. Emergency Resources
        fragmentList.add(new EmergencyResourcesFragment());
        titleList.add("📦 Emergency Resources");

        // 5. Admin Control Center (ONLY visible for admin users)
        if (isAdmin) {
            fragmentList.add(new AdminControlCenterFragment());
            titleList.add("🛡️ Admin Control Center");
        }

        DashboardPagerAdapter adapter = new DashboardPagerAdapter(this, fragmentList);
        viewPagerDashboard.setAdapter(adapter);

        new TabLayoutMediator(topTabLayout, viewPagerDashboard, (tab, position) -> tab.setText(titleList.get(position))).attach();
    }

    private void logout() {
        SharedPreferences prefs = getSharedPreferences("dconnect_prefs", MODE_PRIVATE);
        prefs.edit().clear().apply();

        Toast.makeText(this, "Logged out successfully", Toast.LENGTH_SHORT).show();
        startActivity(new Intent(this, LoginActivity.class));
        finish();
    }

    private static class DashboardPagerAdapter extends FragmentStateAdapter {
        private final List<Fragment> fragments;

        DashboardPagerAdapter(@NonNull FragmentActivity fragmentActivity, List<Fragment> fragments) {
            super(fragmentActivity);
            this.fragments = fragments;
        }

        @NonNull
        @Override
        public Fragment createFragment(int position) {
            return fragments.get(position);
        }

        @Override
        public int getItemCount() {
            return fragments.size();
        }
    }
}
