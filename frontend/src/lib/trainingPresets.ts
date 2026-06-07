export type CpuPreset =
  | 'turbo_accuracy'
  | 'hostinger_production'
  | 'ultimate_accuracy'
  | 'fine_tune'
  | 'best_accuracy'
  | 'max_cpu'
  | 'fleet_cpu'
  | 'turbo_cpu'
  | 'fast_cpu'
  | 'balanced';

export const CPU_PRESETS: Record<CpuPreset, { label: string; description: string; epochs: number }> = {
  turbo_accuracy: {
    label: 'Turbo Accuracy · أفضل دقة وأسرع',
    description: 'يكمل من النموذج الرئيسي · 448px · إيقاف مبكر ذكي · RAM cache — أفضل دقة بأقل زمن',
    epochs: 30,
  },
  hostinger_production: {
    label: 'إنتاج Hostinger',
    description: '20 دورة · 512px · RAM cache — توازن جودة/سرعة',
    epochs: 20,
  },
  ultimate_accuracy: {
    label: 'أقصى دقة',
    description: '40 دورة · 640px · بطيء — للجودة القصوى فقط',
    epochs: 40,
  },
  fine_tune: {
    label: 'تقوية الموديل · Fine-tune',
    description: '30 دورة · 640px · تعلم بطيء — يكمل من نفس الموديل الموحد ويرفع الدقة',
    epochs: 30,
  },
  best_accuracy: {
    label: 'Best Accuracy',
    description: '20 epochs · 640px · medium aug — first training from pretrained base',
    epochs: 20,
  },
  max_cpu: {
    label: 'Max CPU',
    description: '12 epochs · 416px — fastest full training run',
    epochs: 12,
  },
  fleet_cpu: {
    label: 'Fleet Camera',
    description: '12 epochs · 416px — tuned for live road detection',
    epochs: 12,
  },
  turbo_cpu: {
    label: 'Turbo CPU',
    description: '5 epochs · 320px · minimal aug — quick test only',
    epochs: 5,
  },
  fast_cpu: {
    label: 'Fast CPU',
    description: '8 epochs · 416px · light aug — faster iteration',
    epochs: 8,
  },
  balanced: {
    label: 'Balanced CPU',
    description: '15 epochs · 640px · medium aug — good quality, shorter than Best',
    epochs: 15,
  },
};

export const DEFAULT_CPU_PRESET: CpuPreset = 'turbo_accuracy';

export function buildRetrainQuery(params: {
  epochs?: number;
  architecture?: string;
  preset?: CpuPreset;
  fineTune?: boolean;
  sourceModelArtifactId?: string;
  classIds?: string[];
}): string {
  const q = new URLSearchParams();
  if (params.epochs != null) q.set('epochs', String(params.epochs));
  if (params.architecture) q.set('architecture', params.architecture);
  q.set('preset', params.preset ?? DEFAULT_CPU_PRESET);
  if (params.sourceModelArtifactId) {
    q.set('source_model_artifact_id', params.sourceModelArtifactId);
    q.set('fine_tune', 'true');
  } else {
    q.set('fine_tune', String(params.fineTune ?? true));
  }
  for (const id of params.classIds ?? []) {
    q.append('class_ids', id);
  }
  return q.toString();
}
