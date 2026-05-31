import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import ProjectsPage from '@/pages/projects/ProjectsPage';
import ProjectDetailPage from '@/pages/projects/ProjectDetailPage';
import DataHubPage from '@/pages/data/DataHubPage';
import DatasetsPage from '@/pages/datasets/DatasetsPage';
import AnnotationPage from '@/pages/annotation/AnnotationPage';
import ClassesPage from '@/pages/classes/ClassesPage';
import TrainingPage from '@/pages/training/TrainingPage';
import ModelsPage from '@/pages/models/ModelsPage';
import DeploymentsPage from '@/pages/deployments/DeploymentsPage';
import MonitoringPage from '@/pages/monitoring/MonitoringPage';
import IngestionPage from '@/pages/ingestion/IngestionPage';
import RoadIntelligencePage from '@/pages/road-intelligence/RoadIntelligencePage';
import FleetPage from '@/pages/fleet/FleetPage';
import ReportsPage from '@/pages/reports/ReportsPage';
import SettingsPage from '@/pages/settings/SettingsPage';

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route index element={<DashboardPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="projects/:id" element={<ProjectDetailPage />} />
            <Route path="projects/:id/data" element={<DataHubPage />} />
            <Route path="projects/:id/datasets" element={<DatasetsPage />} />
            <Route path="projects/:id/annotation" element={<AnnotationPage />} />
            <Route path="projects/:id/classes" element={<ClassesPage />} />
            <Route path="projects/:id/training" element={<TrainingPage />} />
            <Route path="projects/:id/models" element={<ModelsPage />} />
            <Route path="projects/:id/deployments" element={<DeploymentsPage />} />
            <Route path="projects/:id/monitoring" element={<MonitoringPage />} />
            <Route path="ingestion" element={<IngestionPage />} />
            <Route path="road-intelligence" element={<RoadIntelligencePage />} />
            <Route path="fleet" element={<FleetPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
