import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProjectLayout } from '@/components/layout/ProjectLayout';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import ProjectsPage from '@/pages/projects/ProjectsPage';
import ProjectDetailPage from '@/pages/projects/ProjectDetailPage';
import DataHubPage from '@/pages/data/DataHubPage';
import DatasetBuilderLandingPage from '@/pages/data/DatasetBuilderLandingPage';
import DatasetsPage from '@/pages/datasets/DatasetsPage';
import DatasetDetailPage from '@/pages/datasets/DatasetDetailPage';
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
            <Route path="builder" element={<DatasetBuilderLandingPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="projects/:id" element={<ProjectLayout />}>
              <Route index element={<ProjectDetailPage />} />
              <Route path="data" element={<DataHubPage />} />
              <Route path="datasets" element={<DatasetsPage />} />
              <Route path="datasets/:datasetId" element={<DatasetDetailPage />} />
              <Route path="annotation" element={<AnnotationPage />} />
              <Route path="classes" element={<ClassesPage />} />
              <Route path="training" element={<TrainingPage />} />
              <Route path="models" element={<ModelsPage />} />
              <Route path="deployments" element={<DeploymentsPage />} />
              <Route path="monitoring" element={<MonitoringPage />} />
            </Route>
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
