package com.dconnect.app.ui.fragments;

import android.os.Bundle;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.dconnect.app.R;
import com.dconnect.app.models.DisasterItem;
import com.dconnect.app.network.ApiClient;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Tab 5: Admin Control Center Fragment.
 * Visible ONLY for ADMIN users. Provides system stats, incident status management, and data resets.
 */
public class AdminControlCenterFragment extends Fragment {

    private static final String TAG = "DConnect_AdminTab";

    private TextView textKpiDisasters, textKpiMerged;
    private Button btnAdminRefresh, btnAdminResetData;
    private RecyclerView recyclerAdminDisasters;

    private AdminDisasterAdapter adapter;
    private final List<DisasterItem> adminDisasters = new ArrayList<>();

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        View view = inflater.inflate(R.layout.fragment_admin_control_center, container, false);

        textKpiDisasters = view.findViewById(R.id.textKpiDisasters);
        textKpiMerged = view.findViewById(R.id.textKpiMerged);
        btnAdminRefresh = view.findViewById(R.id.btnAdminRefresh);
        btnAdminResetData = view.findViewById(R.id.btnAdminResetData);
        recyclerAdminDisasters = view.findViewById(R.id.recyclerAdminDisasters);

        recyclerAdminDisasters.setLayoutManager(new LinearLayoutManager(getContext()));
        adapter = new AdminDisasterAdapter(adminDisasters, this::updateStatus);
        recyclerAdminDisasters.setAdapter(adapter);

        btnAdminRefresh.setOnClickListener(v -> loadAdminData());

        btnAdminResetData.setOnClickListener(v -> {
            ApiClient.resetSystemData(new ApiClient.ApiCallback() {
                @Override
                public void onSuccess(String responseText) {
                    if (getActivity() == null) return;
                    getActivity().runOnUiThread(() -> {
                        Toast.makeText(getContext(), "⚠️ System data reset successfully", Toast.LENGTH_SHORT).show();
                        loadAdminData();
                    });
                }

                @Override
                public void onError(String errorMessage) {
                    if (getActivity() == null) return;
                    getActivity().runOnUiThread(() -> Toast.makeText(getContext(), "Reset failed: " + errorMessage, Toast.LENGTH_SHORT).show());
                }
            });
        });

        loadAdminData();

        return view;
    }

    public void loadAdminData() {
        ApiClient.getAdminStats(new ApiClient.ApiCallback() {
            @Override
            public void onSuccess(String responseText) {
                if (getActivity() == null) return;
                getActivity().runOnUiThread(() -> {
                    try {
                        JsonObject root = ApiClient.GSON.fromJson(responseText, JsonObject.class);
                        if (root.has("data") && root.get("data").isJsonObject()) {
                            JsonObject data = root.getAsJsonObject("data");
                            if (data.has("activeDisasters")) textKpiDisasters.setText(data.get("activeDisasters").getAsString());
                            if (data.has("reportsAggregated")) textKpiMerged.setText(data.get("reportsAggregated").getAsString());
                        }
                    } catch (Exception e) {
                        Log.w(TAG, "Error parsing admin stats: " + e.getMessage());
                    }
                });
            }

            @Override
            public void onError(String errorMessage) {}
        });

        ApiClient.getDisasters("", "", new ApiClient.ApiCallback() {
            @Override
            public void onSuccess(String responseText) {
                if (getActivity() == null) return;
                getActivity().runOnUiThread(() -> parseAdminDisasters(responseText));
            }

            @Override
            public void onError(String errorMessage) {}
        });
    }

    private void parseAdminDisasters(String json) {
        adminDisasters.clear();
        try {
            JsonObject root = ApiClient.GSON.fromJson(json, JsonObject.class);
            JsonArray array = null;

            if (root.has("data") && root.get("data").isJsonArray()) {
                array = root.getAsJsonArray("data");
            } else if (root.isJsonArray()) {
                array = root.getAsJsonArray();
            }

            if (array != null && array.size() > 0) {
                for (JsonElement elem : array) {
                    JsonObject obj = elem.getAsJsonObject();
                    String id = obj.has("id") ? obj.get("id").getAsString() : "";
                    String title = obj.has("title") ? obj.get("title").getAsString() : "Incident";
                    String type = obj.has("type") ? obj.get("type").getAsString() : "OTHER";
                    String status = obj.has("status") ? obj.get("status").getAsString() : "VERIFIED_ACTIVE";
                    String desc = obj.has("description") ? obj.get("description").getAsString() : "";
                    String loc = obj.has("locationName") ? obj.get("locationName").getAsString() : "Location";
                    double lat = obj.has("latitude") && !obj.get("latitude").isJsonNull() ? obj.get("latitude").getAsDouble() : 13.0827;
                    double lng = obj.has("longitude") && !obj.get("longitude").isJsonNull() ? obj.get("longitude").getAsDouble() : 80.2707;
                    String reporter = obj.has("reporterName") ? obj.get("reporterName").getAsString() : "Reporter";
                    String role = obj.has("reporterRole") ? obj.get("reporterRole").getAsString() : "USER";
                    int count = obj.has("aggregatedCount") ? obj.get("aggregatedCount").getAsInt() : 1;
                    String date = obj.has("createdAt") ? obj.get("createdAt").getAsString() : "";

                    adminDisasters.add(new DisasterItem(id, title, type, status, desc, loc, lat, lng, reporter, role, count, date));
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error parsing admin disasters: " + e.getMessage(), e);
        }
        adapter.notifyDataSetChanged();
    }

    private void updateStatus(String disasterId, String status) {
        ApiClient.updateDisasterStatus(disasterId, status, new ApiClient.ApiCallback() {
            @Override
            public void onSuccess(String responseText) {
                if (getActivity() == null) return;
                getActivity().runOnUiThread(() -> {
                    Toast.makeText(getContext(), "Incident #" + disasterId + " status updated to " + status, Toast.LENGTH_SHORT).show();
                    loadAdminData();
                });
            }

            @Override
            public void onError(String errorMessage) {
                if (getActivity() == null) return;
                getActivity().runOnUiThread(() -> Toast.makeText(getContext(), "Failed to update: " + errorMessage, Toast.LENGTH_SHORT).show());
            }
        });
    }

    private interface StatusClickListener {
        void onClick(String id, String newStatus);
    }

    private static class AdminDisasterAdapter extends RecyclerView.Adapter<AdminDisasterAdapter.ViewHolder> {
        private final List<DisasterItem> items;
        private final StatusClickListener listener;

        AdminDisasterAdapter(List<DisasterItem> items, StatusClickListener listener) {
            this.items = items;
            this.listener = listener;
        }

        @NonNull
        @Override
        public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_disaster_card, parent, false);
            return new ViewHolder(view);
        }

        @Override
        public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
            DisasterItem item = items.get(position);
            holder.itemTypeBadge.setText(item.getType());
            holder.itemStatusBadge.setText(item.getStatus());
            holder.itemTitle.setText("#" + item.getId() + " - " + item.getTitle());
            holder.itemLocation.setText("📍 " + item.getLocationName());
            holder.itemDescription.setText(item.getDescription());
            holder.itemReporterInfo.setText("Reporter: " + item.getReporterName() + " (" + item.getReporterRole() + ")");
            holder.itemMergedCount.setText("🔗 " + item.getAggregatedCount() + " merged");

            holder.itemView.setOnClickListener(v -> {
                String nextStatus = "VERIFIED_ACTIVE".equals(item.getStatus()) ? "RESOLVED" : "VERIFIED_ACTIVE";
                listener.onClick(item.getId(), nextStatus);
            });
        }

        @Override
        public int getItemCount() {
            return items.size();
        }

        static class ViewHolder extends RecyclerView.ViewHolder {
            TextView itemTypeBadge, itemStatusBadge, itemTitle, itemLocation, itemDescription, itemReporterInfo, itemMergedCount;

            ViewHolder(@NonNull View itemView) {
                super(itemView);
                itemTypeBadge = itemView.findViewById(R.id.itemTypeBadge);
                itemStatusBadge = itemView.findViewById(R.id.itemStatusBadge);
                itemTitle = itemView.findViewById(R.id.itemTitle);
                itemLocation = itemView.findViewById(R.id.itemLocation);
                itemDescription = itemView.findViewById(R.id.itemDescription);
                itemReporterInfo = itemView.findViewById(R.id.itemReporterInfo);
                itemMergedCount = itemView.findViewById(R.id.itemMergedCount);
            }
        }
    }
}
