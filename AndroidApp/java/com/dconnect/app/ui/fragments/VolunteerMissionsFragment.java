package com.dconnect.app.ui.fragments;

import android.os.Bundle;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.dconnect.app.R;
import com.dconnect.app.models.VolunteerItem;
import com.dconnect.app.network.ApiClient;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Tab 3: Volunteer Missions & Directory Fragment.
 */
public class VolunteerMissionsFragment extends Fragment {

    private static final String TAG = "DConnect_VolunteerTab";

    private RecyclerView recyclerVolunteers;
    private TextView textEmptyVolunteers;
    private VolunteerAdapter adapter;
    private final List<VolunteerItem> volunteerList = new ArrayList<>();

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        View view = inflater.inflate(R.layout.fragment_volunteer_missions, container, false);

        recyclerVolunteers = view.findViewById(R.id.recyclerVolunteers);
        textEmptyVolunteers = view.findViewById(R.id.textEmptyVolunteers);

        recyclerVolunteers.setLayoutManager(new LinearLayoutManager(getContext()));
        adapter = new VolunteerAdapter(volunteerList);
        recyclerVolunteers.setAdapter(adapter);

        loadVolunteers();

        return view;
    }

    public void loadVolunteers() {
        ApiClient.getVolunteers(new ApiClient.ApiCallback() {
            @Override
            public void onSuccess(String responseText) {
                if (getActivity() == null) return;
                getActivity().runOnUiThread(() -> parseAndDisplayVolunteers(responseText));
            }

            @Override
            public void onError(String errorMessage) {
                if (getActivity() == null) return;
                getActivity().runOnUiThread(() -> {
                    Log.w(TAG, "Error loading volunteers: " + errorMessage);
                    textEmptyVolunteers.setVisibility(View.VISIBLE);
                });
            }
        });
    }

    private void parseAndDisplayVolunteers(String json) {
        volunteerList.clear();
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
                    String name = obj.has("name") ? obj.get("name").getAsString() : "Volunteer";
                    String phone = obj.has("phone") ? obj.get("phone").getAsString() : "N/A";
                    String skills = obj.has("skills") ? obj.get("skills").getAsString() : "General Relief";
                    String status = obj.has("availabilityStatus") ? obj.get("availabilityStatus").getAsString() : "AVAILABLE";
                    String org = obj.has("organizationName") ? obj.get("organizationName").getAsString() : "Independent";

                    volunteerList.add(new VolunteerItem(id, name, phone, skills, status, org));
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error parsing volunteers JSON: " + e.getMessage(), e);
        }

        if (volunteerList.isEmpty()) {
            textEmptyVolunteers.setVisibility(View.VISIBLE);
            recyclerVolunteers.setVisibility(View.GONE);
        } else {
            textEmptyVolunteers.setVisibility(View.GONE);
            recyclerVolunteers.setVisibility(View.VISIBLE);
            adapter.notifyDataSetChanged();
        }
    }

    private static class VolunteerAdapter extends RecyclerView.Adapter<VolunteerAdapter.ViewHolder> {
        private final List<VolunteerItem> items;

        VolunteerAdapter(List<VolunteerItem> items) {
            this.items = items;
        }

        @NonNull
        @Override
        public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_volunteer_card, parent, false);
            return new ViewHolder(view);
        }

        @Override
        public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
            VolunteerItem item = items.get(position);
            holder.itemVolName.setText(item.getName());
            holder.itemVolStatus.setText(item.getAvailabilityStatus());
            holder.itemVolSkills.setText("Skills: " + item.getSkills());
            holder.itemVolOrg.setText("Organization: " + item.getOrganizationName());
            holder.itemVolPhone.setText("📞 " + item.getPhone());
        }

        @Override
        public int getItemCount() {
            return items.size();
        }

        static class ViewHolder extends RecyclerView.ViewHolder {
            TextView itemVolName, itemVolStatus, itemVolSkills, itemVolOrg, itemVolPhone;

            ViewHolder(@NonNull View itemView) {
                super(itemView);
                itemVolName = itemView.findViewById(R.id.itemVolName);
                itemVolStatus = itemView.findViewById(R.id.itemVolStatus);
                itemVolSkills = itemView.findViewById(R.id.itemVolSkills);
                itemVolOrg = itemView.findViewById(R.id.itemVolOrg);
                itemVolPhone = itemView.findViewById(R.id.itemVolPhone);
            }
        }
    }
}
