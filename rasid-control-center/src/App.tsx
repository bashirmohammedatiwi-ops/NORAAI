import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppLayout, AuthGuard } from '@/components/layout/AppLayout';
import LoginPage from '@/pages/LoginPage';
import OverviewPage from '@/pages/OverviewPage';
import AlertsPage from '@/pages/AlertsPage';
import LiveMapPage from '@/pages/LiveMapPage';
import FleetPage from '@/pages/FleetPage';
import MunicipalitiesPage from '@/pages/MunicipalitiesPage';
import NotificationsPage from '@/pages/NotificationsPage';
import ModelsPage from '@/pages/ModelsPage';
import AnalyticsPage from '@/pages/AnalyticsPage';
import EmergencyPage from '@/pages/EmergencyPage';
import ReportsPage from '@/pages/ReportsPage';
import ActivityPage from '@/pages/ActivityPage';
import LabPage from '@/pages/LabPage';
import CommandCenterPage from '@/pages/CommandCenterPage';
import SystemPage from '@/pages/SystemPage';
import IntegrationsPage from '@/pages/IntegrationsPage';

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5000 } },
});

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AuthGuard><AppLayout /></AuthGuard>}>
            <Route index element={<OverviewPage />} />
            <Route path="command" element={<CommandCenterPage />} />
            <Route path="alerts" element={<AlertsPage />} />
            <Route path="map" element={<LiveMapPage />} />
            <Route path="emergency" element={<EmergencyPage />} />
            <Route path="activity" element={<ActivityPage />} />
            <Route path="fleet" element={<FleetPage />} />
            <Route path="municipalities" element={<MunicipalitiesPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="models" element={<ModelsPage />} />
            <Route path="lab" element={<LabPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="system" element={<SystemPage />} />
            <Route path="integrations" element={<IntegrationsPage />} />
            <Route path="settings" element={<Navigate to="/" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
