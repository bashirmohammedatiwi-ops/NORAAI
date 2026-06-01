import { api } from '@/lib/api';

export async function cancelTrainingJob(jobId: string): Promise<void> {
  await api.post(`/api/v1/training/${jobId}/cancel`);
}
