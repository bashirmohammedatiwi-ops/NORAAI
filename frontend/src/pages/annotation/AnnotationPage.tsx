import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { AnnotationGuide } from '@/components/annotation/AnnotationGuide';
import { AnnotationImageList, type ImageFilter } from '@/components/annotation/AnnotationImageList';
import { AnnotationReviewQueue } from '@/components/annotation/AnnotationReviewQueue';
import { AnnotationStatsBar } from '@/components/annotation/AnnotationStatsBar';
import { ManualBBoxEditor } from '@/components/annotation/ManualBBoxEditor';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { useAnnotationWorkspace } from '@/hooks/useAnnotationWorkspace';
import { cn } from '@/lib/utils';
import {
  BookOpen, ChevronLeft, ChevronRight, ClipboardCheck, Database, PenTool,
} from 'lucide-react';

type Section = 'label' | 'review' | 'guide';

export default function AnnotationPage() {
  const { id: projectId } = useParams();
  const { stats, images, classes, classMap, pending, loading, reload } = useAnnotationWorkspace(projectId);
  const [section, setSection] = useState<Section>('label');
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [imageFilter, setImageFilter] = useState<ImageFilter>('all');
  const [editorSaving, setEditorSaving] = useState(false);

  useEffect(() => {
    if (!selectedImageId && images.length > 0) {
      setSelectedImageId(images[0].id);
    }
  }, [images, selectedImageId]);

  const filteredIds = useMemo(() => {
    let list = images;
    if (imageFilter === 'unlabeled') list = list.filter((i) => !i.has_labels);
    if (imageFilter === 'labeled') list = list.filter((i) => i.has_labels);
    if (imageFilter === 'pending') list = list.filter((i) => i.needs_review);
    if (imageFilter === 'manual') list = list.filter((i) => i.has_manual_labels);
    if (imageFilter === 'no_manual') list = list.filter((i) => !i.has_manual_labels);
    return list.map((i) => i.id);
  }, [images, imageFilter]);

  const currentIndex = selectedImageId ? filteredIds.indexOf(selectedImageId) : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < filteredIds.length - 1;

  const goPrev = useCallback(() => {
    if (hasPrev) setSelectedImageId(filteredIds[currentIndex - 1]);
  }, [hasPrev, filteredIds, currentIndex]);

  const goNext = useCallback(() => {
    if (hasNext) setSelectedImageId(filteredIds[currentIndex + 1]);
  }, [hasNext, filteredIds, currentIndex]);

  const selectedMeta = images.find((i) => i.id === selectedImageId);

  const approve = async (annId: string) => {
    await api.post(`/api/v1/annotation/${annId}/approve`);
    await reload();
  };

  const reject = async (annId: string) => {
    await api.post(`/api/v1/annotation/${annId}/reject`);
    await reload();
  };

  const openEditFromReview = (imageId: string) => {
    setSelectedImageId(imageId);
    setSection('label');
  };

  const sections: { id: Section; label: string; labelAr: string; icon: typeof PenTool; badge?: number }[] = [
    { id: 'label', label: 'Label', labelAr: 'تسمية', icon: PenTool },
    { id: 'review', label: 'Review', labelAr: 'مراجعة', icon: ClipboardCheck, badge: pending.length },
    { id: 'guide', label: 'Guide', labelAr: 'دليل', icon: BookOpen },
  ];

  return (
    <div className="space-y-5 -mx-1 sm:mx-0">
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/8 via-card to-card p-5 sm:p-6">
        <PageHeader
          title="التسمية · Annotation"
          description="قسم مستقل لتعديل الصناديق ومراجعة التسميات التلقائية قبل التدريب."
        >
          <Link to={`/projects/${projectId}/data`}>
            <Button type="button" variant="outline" size="sm" className="gap-1.5">
              <Database className="h-4 w-4" />
              البيانات
            </Button>
          </Link>
        </PageHeader>
        <div className="mt-4">
          <AnnotationStatsBar stats={stats} loading={loading} />
        </div>
      </div>

      <nav className="flex flex-wrap gap-2 p-1 rounded-xl bg-secondary/50 border border-border w-fit">
        {sections.map(({ id, label, labelAr, icon: Icon, badge }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              section === id
                ? 'bg-card text-foreground shadow-sm border border-border'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{labelAr}</span>
            <span className="hidden sm:inline text-muted-foreground font-normal">({label})</span>
            {badge != null && badge > 0 && (
              <span className="text-[10px] min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-amber-500 text-white font-bold px-1">
                {badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      {section === 'label' && (
        <div className="grid grid-cols-1 xl:grid-cols-[220px_1fr] gap-0 xl:gap-4 min-h-[560px] rounded-2xl border border-border bg-card overflow-hidden">
          <aside className="xl:border-r border-border flex flex-col min-h-[240px] xl:min-h-[600px] max-h-[40vh] xl:max-h-none">
            <AnnotationImageList
              images={images}
              selectedId={selectedImageId}
              onSelect={setSelectedImageId}
              filter={imageFilter}
              onFilterChange={setImageFilter}
            />
          </aside>

          <main className="flex flex-col min-h-0 p-4 sm:p-5">
            {images.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-16 px-4">
                <PenTool className="h-12 w-12 text-muted-foreground/40 mb-4" />
                <p className="font-medium">لا توجد صور بعد</p>
                <p className="text-sm text-muted-foreground mt-2 max-w-sm">
                  ارفع صور الحوادث والحفر من مركز البيانات، ثم ارجع هنا لرسم الصناديق.
                </p>
                <Link to={`/projects/${projectId}/data`} className="mt-4">
                  <Button>فتح مركز البيانات</Button>
                </Link>
              </div>
            ) : selectedImageId && classes.length > 0 ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3 shrink-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" title={selectedMeta?.filename}>
                      {selectedMeta?.filename ?? 'صورة'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {currentIndex >= 0 ? `${currentIndex + 1} / ${filteredIds.length}` : '—'}
                      {selectedMeta && selectedMeta.annotation_count > 0 && (
                        <> · {selectedMeta.annotation_count} صندوق</>
                      )}
                      {selectedMeta?.has_manual_labels && (
                        <span className="text-emerald-600"> · تسمية يدوية</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button type="button" size="sm" variant="outline" disabled={!hasPrev || editorSaving} onClick={goPrev}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={!hasNext || editorSaving} onClick={goNext}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                  {classes.map((c) => (
                    <span
                      key={c.id}
                      className="text-xs px-2 py-1 rounded-full border"
                      style={{ borderColor: c.color, color: c.color, backgroundColor: `${c.color}18` }}
                    >
                      {c.name}
                    </span>
                  ))}
                </div>

                <ManualBBoxEditor
                  key={selectedImageId}
                  imageId={selectedImageId}
                  classes={classes}
                  onSaved={reload}
                  onSavingChange={setEditorSaving}
                  onPrevImage={goPrev}
                  onNextImage={goNext}
                  hasPrev={hasPrev}
                  hasNext={hasNext}
                />
              </>
            ) : (
              <p className="text-muted-foreground text-sm py-12 text-center">
                {classes.length === 0 ? 'أضف أصنافاً من قسم Classes أولاً.' : 'اختر صورة من القائمة.'}
              </p>
            )}
          </main>
        </div>
      )}

      {section === 'review' && (
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
          <h3 className="text-lg font-semibold mb-1">مراجعة التسميات التلقائية</h3>
          <p className="text-sm text-muted-foreground mb-4">
            وافق على الصندوق إن كان صحيحاً، أو عدّل يدوياً من تبويب التسمية.
          </p>
          <AnnotationReviewQueue
            pending={pending}
            classMap={classMap}
            onApprove={approve}
            onReject={reject}
            onEdit={openEditFromReview}
          />
        </div>
      )}

      {section === 'guide' && projectId && (
        <AnnotationGuide projectId={projectId} />
      )}
    </div>
  );
}
