package com.dconnect.app.ui.fragments;

import android.os.Bundle;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.dconnect.app.R;
import com.dconnect.app.models.ResourceItem;
import com.dconnect.app.network.ApiClient;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Tab 4: Emergency Resources Fragment.
 * Form for offering resources and list of available supply pool items.
 */
public class EmergencyResourcesFragment extends Fragment {

    private static final String TAG = "DConnect_ResourceTab";

    private Spinner spinnerResCategory;
    private EditText editResDescription, editResQty, editResUnit, editResAddress;
    private Button btnSubmitResource;
    private RecyclerView recyclerResources;
    private TextView textEmptyResources;

    private ResourceAdapter adapter;
    private final List<ResourceItem> resourceList = new ArrayList<>();

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        View view = inflater.inflate(R.layout.fragment_emergency_resources, container, false);

        spinnerResCategory = view.findViewById(R.id.spinnerResCategory);
        editResDescription = view.findViewById(R.id.editResDescription);
        editResQty = view.findViewById(R.id.editResQty);
        editResUnit = view.findViewById(R.id.editResUnit);
        editResAddress = view.findViewById(R.id.editResAddress);
        btnSubmitResource = view.findViewById(R.id.btnSubmitResource);
        recyclerResources = view.findViewById(R.id.recyclerResources);
        textEmptyResources = view.findViewById(R.id.textEmptyResources);

        setupCategories();

        recyclerResources.setLayoutManager(new LinearLayoutManager(getContext()));
        adapter = new ResourceAdapter(resourceList);
        recyclerResources.setAdapter(adapter);

        btnSubmitResource.setOnClickListener(v -> submitResource());

        loadResources();

        return view;
    }

    private void setupCategories() {
        String[] categories = {"FOOD", "WATER", "MEDICAL", "SHELTER", "RESCUE_EQUIPMENT", "TRANSPORT", "CLOTHING", "OTHER"};
        ArrayAdapter<String> catAdapter = new ArrayAdapter<>(requireContext(), android.R.layout.simple_spinner_item, categories);
        catAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerResCategory.setAdapter(catAdapter);
    }

    private void submitResource() {
        String cat = spinnerResCategory.getSelectedItem() != null ? spinnerResCategory.getSelectedItem().toString() : "FOOD";
        String desc = editResDescription.getText().toString().trim();
        String qtyStr = editResQty.getText().toString().trim();
        String unit = editResUnit.getText().toString().trim();
        String address = editResAddress.getText().toString().trim();

        if (desc.isEmpty() || qtyStr.isEmpty() || unit.isEmpty() || address.isEmpty()) {
            Toast.makeText(getContext(), "Please fill in all required resource fields", Toast.LENGTH_SHORT).show();
            return;
        }

        int qty = 1;
        try {
            qty = Integer.parseInt(qtyStr);
        } catch (NumberFormatException ignored) {}

        btnSubmitResource.setEnabled(false);
        btnSubmitResource.setText("Adding...");

        ApiClient.createResource(cat, desc, qty, unit, "AVAILABLE", address, 13.0827, 80.2707, "", "", new ApiClient.ApiCallback() {
            @Override
            public void onSuccess(String responseText) {
                if (getActivity() == null) return;
                getActivity().runOnUiThread(() -> {
                    btnSubmitResource.setEnabled(true);
                    btnSubmitResource.setText("ADD TO SUPPLY POOL");

                    editResDescription.setText("");
                    editResQty.setText("");
                    editResUnit.setText("");
                    editResAddress.setText("");

                    Toast.makeText(getContext(), "📦 Resource Added to Supply Pool!", Toast.LENGTH_SHORT).show();
                    loadResources();
                });
            }

            @Override
            public void onError(String errorMessage) {
                if (getActivity() == null) return;
                getActivity().runOnUiThread(() -> {
                    btnSubmitResource.setEnabled(true);
                    btnSubmitResource.setText("ADD TO SUPPLY POOL");
                    Toast.makeText(getContext(), "Failed to add resource: " + errorMessage, Toast.LENGTH_LONG).show();
                });
            }
        });
    }

    public void loadResources() {
        ApiClient.getResources(new ApiClient.ApiCallback() {
            @Override
            public void onSuccess(String responseText) {
                if (getActivity() == null) return;
                getActivity().runOnUiThread(() -> parseAndDisplayResources(responseText));
            }

            @Override
            public void onError(String errorMessage) {
                if (getActivity() == null) return;
                getActivity().runOnUiThread(() -> {
                    Log.w(TAG, "Error loading resources: " + errorMessage);
                    textEmptyResources.setVisibility(View.VISIBLE);
                });
            }
        });
    }

    private void parseAndDisplayResources(String json) {
        resourceList.clear();
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
                    String cat = obj.has("resourceType") ? obj.get("resourceType").getAsString() : (obj.has("category") ? obj.get("category").getAsString() : "OTHER");
                    String desc = obj.has("description") ? obj.get("description").getAsString() : "Emergency Supplies";
                    int qty = obj.has("quantity") ? obj.get("quantity").getAsInt() : 1;
                    String unit = obj.has("unit") ? obj.get("unit").getAsString() : "units";
                    String status = obj.has("status") ? obj.get("status").getAsString() : "AVAILABLE";
                    String address = obj.has("address") ? obj.get("address").getAsString() : "Relief Center";
                    double lat = obj.has("latitude") && !obj.get("latitude").isJsonNull() ? obj.get("latitude").getAsDouble() : 13.0827;
                    double lng = obj.has("longitude") && !obj.get("longitude").isJsonNull() ? obj.get("longitude").getAsDouble() : 80.2707;
                    String phone = obj.has("phone") ? obj.get("phone").getAsString() : "N/A";
                    String until = obj.has("availableUntil") ? obj.get("availableUntil").getAsString() : "No Expiry";

                    resourceList.add(new ResourceItem(id, cat, desc, qty, unit, status, address, lat, lng, phone, until));
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error parsing resources JSON: " + e.getMessage(), e);
        }

        if (resourceList.isEmpty()) {
            textEmptyResources.setVisibility(View.VISIBLE);
            recyclerResources.setVisibility(View.GONE);
        } else {
            textEmptyResources.setVisibility(View.GONE);
            recyclerResources.setVisibility(View.VISIBLE);
            adapter.notifyDataSetChanged();
        }
    }

    private static class ResourceAdapter extends RecyclerView.Adapter<ResourceAdapter.ViewHolder> {
        private final List<ResourceItem> items;

        ResourceAdapter(List<ResourceItem> items) {
            this.items = items;
        }

        @NonNull
        @Override
        public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_resource_card, parent, false);
            return new ViewHolder(view);
        }

        @Override
        public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
            ResourceItem item = items.get(position);
            holder.itemResCategory.setText(item.getCategory());
            holder.itemResStatus.setText(item.getStatus());
            holder.itemResQty.setText(item.getQuantity() + " " + item.getUnit());
            holder.itemResDesc.setText(item.getDescription());
            holder.itemResAddress.setText("📍 " + item.getAddress());
            holder.itemResContact.setText("📞 Contact: " + item.getPhone());
        }

        @Override
        public int getItemCount() {
            return items.size();
        }

        static class ViewHolder extends RecyclerView.ViewHolder {
            TextView itemResCategory, itemResStatus, itemResQty, itemResDesc, itemResAddress, itemResContact;

            ViewHolder(@NonNull View itemView) {
                super(itemView);
                itemResCategory = itemView.findViewById(R.id.itemResCategory);
                itemResStatus = itemView.findViewById(R.id.itemResStatus);
                itemResQty = itemView.findViewById(R.id.itemResQty);
                itemResDesc = itemView.findViewById(R.id.itemResDesc);
                itemResAddress = itemView.findViewById(R.id.itemResAddress);
                itemResContact = itemView.findViewById(R.id.itemResContact);
            }
        }
    }
}
