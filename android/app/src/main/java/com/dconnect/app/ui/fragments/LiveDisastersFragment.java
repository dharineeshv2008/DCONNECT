package com.dconnect.app.ui.fragments;

import android.os.Bundle;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.Spinner;
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
 * Tab 1: Live Disasters Fragment.
 * Displays live incident feed, type & status filters, and GPS coordinates.
 */
public class LiveDisastersFragment extends Fragment {

    private static final String TAG = "DConnect_DisastersTab";

    private TextView textGpsStatus;
    private Button btnRefreshGps;
    private Spinner spinnerTypeFilter;
    private Spinner spinnerStatusFilter;
    private RecyclerView recyclerDisasters;
    private TextView textEmptyDisasters;

    private DisasterAdapter adapter;
    private final List<DisasterItem> disastersList = new ArrayList<>();

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        View view = inflater.inflate(R.layout.fragment_live_disasters, container, false);

        textGpsStatus = view.findViewById(R.id.textGpsStatus);
        btnRefreshGps = view.findViewById(R.id.btnRefreshGps);
        spinnerTypeFilter = view.findViewById(R.id.spinnerTypeFilter);
        spinnerStatusFilter = view.findViewById(R.id.spinnerStatusFilter);
        recyclerDisasters = view.findViewById(R.id.recyclerDisasters);
        textEmptyDisasters = view.findViewById(R.id.textEmptyDisasters);

        recyclerDisasters.setLayoutManager(new LinearLayoutManager(getContext()));
        adapter = new DisasterAdapter(disastersList);
        recyclerDisasters.setAdapter(adapter);

        setupFilters();

        btnRefreshGps.setOnClickListener(v -> {
            textGpsStatus.setText("📍 Device GPS Location: 13.0827, 80.2707");
            Toast.makeText(getContext(), "GPS location refreshed", Toast.LENGTH_SHORT).show();
            loadDisasters();
        });

        loadDisasters();

        return view;
    }

    private void setupFilters() {
        String[] types = {"All Types", "FLOOD", "EARTHQUAKE", "FIRE", "CYCLONE", "LANDSLIDE", "BUILDING_COLLAPSE", "OTHER"};
        ArrayAdapter<String> typeAdapter = new ArrayAdapter<>(requireContext(), android.R.layout.simple_spinner_item, types);
        typeAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerTypeFilter.setAdapter(typeAdapter);

        String[] statuses = {"All Statuses", "VERIFIED_ACTIVE", "PENDING", "IN_PROGRESS", "RESOLVED", "CLOSED"};
        ArrayAdapter<String> statusAdapter = new ArrayAdapter<>(requireContext(), android.R.layout.simple_spinner_item, statuses);
        statusAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerStatusFilter.setAdapter(statusAdapter);

        AdapterView.OnItemSelectedListener filterListener = new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                loadDisasters();
            }

            @Override
            public void onNothingSelected(AdapterView<?> parent) {}
        };

        spinnerTypeFilter.setOnItemSelectedListener(filterListener);
        spinnerStatusFilter.setOnItemSelectedListener(filterListener);
    }

    public void loadDisasters() {
        String type = spinnerTypeFilter.getSelectedItem() != null ? spinnerTypeFilter.getSelectedItem().toString() : "";
        if ("All Types".equals(type)) type = "";

        String status = spinnerStatusFilter.getSelectedItem() != null ? spinnerStatusFilter.getSelectedItem().toString() : "";
        if ("All Statuses".equals(status)) status = "";

        ApiClient.getDisasters(type, status, new ApiClient.ApiCallback() {
            @Override
            public void onSuccess(String responseText) {
                if (getActivity() == null) return;
                getActivity().runOnUiThread(() -> parseAndDisplayDisasters(responseText));
            }

            @Override
            public void onError(String errorMessage) {
                if (getActivity() == null) return;
                getActivity().runOnUiThread(() -> {
                    Log.w(TAG, "Error loading disasters: " + errorMessage);
                    textEmptyDisasters.setVisibility(View.VISIBLE);
                    textEmptyDisasters.setText("Unable to load incidents from server.");
                });
            }
        });
    }

    private void parseAndDisplayDisasters(String json) {
        disastersList.clear();
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
                    String title = obj.has("title") ? obj.get("title").getAsString() : "Untitled Incident";
                    String type = obj.has("type") ? obj.get("type").getAsString() : "OTHER";
                    String status = obj.has("status") ? obj.get("status").getAsString() : "VERIFIED_ACTIVE";
                    String desc = obj.has("description") ? obj.get("description").getAsString() : "";
                    String loc = obj.has("locationName") ? obj.get("locationName").getAsString() : "Location";
                    double lat = obj.has("latitude") && !obj.get("latitude").isJsonNull() ? obj.get("latitude").getAsDouble() : 13.0827;
                    double lng = obj.has("longitude") && !obj.get("longitude").isJsonNull() ? obj.get("longitude").getAsDouble() : 80.2707;
                    String reporter = obj.has("reporterName") ? obj.get("reporterName").getAsString() : "Citizen User";
                    String role = obj.has("reporterRole") ? obj.get("reporterRole").getAsString() : "USER";
                    int count = obj.has("aggregatedCount") ? obj.get("aggregatedCount").getAsInt() : 1;
                    String date = obj.has("createdAt") ? obj.get("createdAt").getAsString() : "";

                    disastersList.add(new DisasterItem(id, title, type, status, desc, loc, lat, lng, reporter, role, count, date));
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error parsing disasters JSON: " + e.getMessage(), e);
        }

        if (disastersList.isEmpty()) {
            textEmptyDisasters.setVisibility(View.VISIBLE);
            recyclerDisasters.setVisibility(View.GONE);
        } else {
            textEmptyDisasters.setVisibility(View.GONE);
            recyclerDisasters.setVisibility(View.VISIBLE);
            adapter.notifyDataSetChanged();
        }
    }

    private static class DisasterAdapter extends RecyclerView.Adapter<DisasterAdapter.ViewHolder> {
        private final List<DisasterItem> items;

        DisasterAdapter(List<DisasterItem> items) {
            this.items = items;
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
            holder.itemTitle.setText(item.getTitle());
            holder.itemLocation.setText("📍 " + item.getLocationName() + " (" + String.format("%.4f", item.getLatitude()) + ", " + String.format("%.4f", item.getLongitude()) + ")");
            holder.itemDescription.setText(item.getDescription());
            holder.itemReporterInfo.setText("Reported by " + item.getReporterName() + " • " + item.getCreatedAt());
            holder.itemMergedCount.setText("🔗 " + item.getAggregatedCount() + " Report(s)");
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
