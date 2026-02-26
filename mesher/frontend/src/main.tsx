import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import "./globals.css";
import App from "./app";
import DashboardPage from "./pages/dashboard";
import IssuesPage from "./pages/issues";
import EventsPage from "./pages/events";
import LiveStreamPage from "./pages/live-stream";
import AlertsPage from "./pages/alerts";
import SettingsPage from "./pages/settings";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<App />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="issues" element={<IssuesPage />} />
          <Route path="events" element={<EventsPage />} />
          <Route path="live" element={<LiveStreamPage />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
