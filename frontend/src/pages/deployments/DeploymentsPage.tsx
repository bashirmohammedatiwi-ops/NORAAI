import { Navigate, useParams } from 'react-router-dom';

/** Deployment is automatic — redirect to unified model page. */
export default function DeploymentsPage() {
  const { id } = useParams();
  return <Navigate to={`/projects/${id}/model`} replace />;
}
