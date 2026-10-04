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
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;

import com.dconnect.app.R;
import com.dconnect.app.network.ApiClient;

/**
 * Tab 2: Report Incident Fragment.
 * Form for reporting new disaster incidents.
 */
public class ReportIncidentFragment extends Fragment {

    private static final String TAG = "DConnect_ReportTab";

    private Spinner spinnerReportType;
    private EditText editReportTitle, editReportLocation, editReportLat, editReportLng, editReportDescription;
    private Button btnSubmitReport;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        View view = inflater.inflate(R.layout.fragment_report_incident, container, false);

        spinnerReportType = view.findViewById(R.id.spinnerReportType);
        editReportTitle = view.findViewById(R.id.editReportTitle);
        editReportLocation = view.findViewById(R.id.editReportLocation);
        editReportLat = view.findViewById(R.id.editReportLat);
        editReportLng = view.findViewById(R.id.editReportLng);
        editReportDescription = view.findViewById(R.id.editReportDescription);
        btnSubmitReport = view.findViewById(R.id.btnSubmitReport);

        setupTypes();

        // Default coordinates (e.g. Chennai)
        editReportLat.setText("13.0827");
        editReportLng.setText("80.2707");

        btnSubmitReport.setOnClickListener(v -> submitReport());

        return view;
    }

    private void setupTypes() {
        String[] types = {"FLOOD", "EARTHQUAKE", "FIRE", "CYCLONE", "LANDSLIDE", "BUILDING_COLLAPSE", "OTHER"};
        ArrayAdapter<String> adapter = new ArrayAdapter<>(requireContext(), android.R.layout.simple_spinner_item, types);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerReportType.setAdapter(adapter);
    }

    private void submitReport() {
        String title = editReportTitle.getText().toString().trim();
        String location = editReportLocation.getText().toString().trim();
        String desc = editReportDescription.getText().toString().trim();
        String type = spinnerReportType.getSelectedItem() != null ? spinnerReportType.getSelectedItem().toString() : "FLOOD";

        if (title.isEmpty() || location.isEmpty() || desc.isEmpty()) {
            Toast.makeText(getContext(), "Please fill in all required fields", Toast.LENGTH_SHORT).show();
            return;
        }

        double lat = 13.0827;
        double lng = 80.2707;
        try {
            lat = Double.parseDouble(editReportLat.getText().toString().trim());
            lng = Double.parseDouble(editReportLng.getText().toString().trim());
        } catch (NumberFormatException e) {
            Log.w(TAG, "Invalid lat/lng string input, using fallback.");
        }

        btnSubmitReport.setEnabled(false);
        btnSubmitReport.setText("Dispatching...");

        ApiClient.reportDisaster(title, type, location, lat, lng, desc, new ApiClient.ApiCallback() {
            @Override
            public void onSuccess(String responseText) {
                if (getActivity() == null) return;
                getActivity().runOnUiThread(() -> {
                    btnSubmitReport.setEnabled(true);
                    btnSubmitReport.setText("🚨 DISPATCH INCIDENT REPORT");

                    editReportTitle.setText("");
                    editReportLocation.setText("");
                    editReportDescription.setText("");

                    Toast.makeText(getContext(), "🚨 Incident Report Dispatched Successfully!", Toast.LENGTH_LONG).show();
                });
            }

            @Override
            public void onError(String errorMessage) {
                if (getActivity() == null) return;
                getActivity().runOnUiThread(() -> {
                    btnSubmitReport.setEnabled(true);
                    btnSubmitReport.setText("🚨 DISPATCH INCIDENT REPORT");
                    Toast.makeText(getContext(), "Failed to submit report: " + errorMessage, Toast.LENGTH_LONG).show();
                });
            }
        });
    }
}
