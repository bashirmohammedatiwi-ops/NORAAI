import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { AuthenticatedImage } from '@/components/datasets/AuthenticatedImage';
import { ImageAnnotationOverlay } from '@/components/datasets/ImageAnnotationOverlay';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, Eye, Filter, ImageIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface GalleryClassStat {
  class_id: string;
  name: string;
  color: string;
  image_count: number;
  annotation_count?: number;
}

export interface GalleryImageItem {
  id: string;
  filename: string;
  status: string;
  source_type: string;
  quality_score: number | null;
  width: number | null;
  height: number | null;
  created_at: string;
  classes: { class_id: string; name: string; color: string }[];
  annotations: {
    id: string;
    class_id: string;
    class_name: string;
    class_color: string;
    x_center: number;
    y_center: number;
    width: number;
    height: number;
    confidence: number | null;
    status: string;
    source: string;
  }[];
  is_annotated: boolean;
}

export interface DatasetGalleryData {
  dataset_id: string;
  dataset_name: string;
  description: string | null;
  total: number;
  limit: number;
  offset: number;
  unlabeled_count: number;
  per_class: GalleryClassStat[];
  items: GalleryImageItem[];
}

interface DatasetGalleryProps {
  datasetId: string;
  projectId?: string;
  pageSize?: number;
  showHeader?: boolean;
}

export function DatasetGallery({ datasetId, projectId, pageSize = 24, showHeader = true }: DatasetGalleryProps) {
  const [gallery, setGallery] = useState<DatasetGalleryData | null>(null);
  const [classFilter, setClassFilter] = useState<string | null>(null);
  const [unlabeledOnly, setUnlabeledOnly] = useState(false);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<GalleryImageItem | null>(null);
  const [loading, setLoading] = useState(true);

  const loadGallery = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(offset),
    });
    if (classFilter) params.set('class_id', classFilter);
    if (unlabeledOnly) params.set('unlabeled_only', 'true');

    try {
      const data = await api.get<DatasetGalleryData>(
        `/api/v1/datasets/${datasetId}/gallery?${params.toString()}`
      );
      setGallery(data);
    } catch {
      setGallery(null);
    } finally {
      setLoading(false);
    }
  }, [datasetId, classFilter, unlabeledOnly, offset, pageSize]);

  useEffect(() => {
    loadGallery();
  }, [loadGallery]);

  useEffect(() => {
    setOffset(0);
  }, [classFilter, unlabeledOnly]);

  const total = gallery?.total ?? 0;
  const page = Math.floor(offset / pageSize) + 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      {showHeader && gallery && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{gallery.dataset_name}</h2>
            {gallery.description && <p className="text-sm text-muted-foreground">{gallery.description}</p>}
            <p className="text-sm text-muted-foreground mt-1">
              {total} image{total !== 1 ? 's' : ''}
              {gallery.unlabeled_count > 0 && ` · ${gallery.unlabeled_count} unlabeled`}
            </p>
          </div>
          {projectId && (
            <Link to={`/projects/${projectId}/data`}>
              <Button variant="outline" size="sm">Upload more</Button>
            </Link>
          )}
        </div>
      )}

      {/* Class filters */}
      {gallery && gallery.per_class.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <button
            type="button"
            onClick={() => { setClassFilter(null); setUnlabeledOnly(false); }}
            className={cn(
              'text-sm px-3 py-1 rounded-full border transition-colors',
              !classFilter && !unlabeledOnly ? 'bg-primary/10 border-primary/40 text-primary' : 'border-border hover:border-primary/30'
            )}
          >
            All ({total})
          </button>
          {gallery.per_class.map((c) => (
            <button
              key={c.class_id}
              type="button"
              onClick={() => { setClassFilter(c.class_id); setUnlabeledOnly(false); }}
              className={cn(
                'text-sm px-3 py-1 rounded-full border transition-colors inline-flex items-center gap-1.5',
                classFilter === c.class_id ? 'bg-primary/10 border-primary/40' : 'border-border hover:border-primary/30'
              )}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
              {c.name} ({c.image_count})
            </button>
          ))}
          {gallery.unlabeled_count > 0 && (
            <button
              type="button"
              onClick={() => { setUnlabeledOnly(true); setClassFilter(null); }}
              className={cn(
                'text-sm px-3 py-1 rounded-full border transition-colors',
                unlabeledOnly ? 'bg-yellow-500/10 border-yellow-500/40 text-yellow-700' : 'border-border'
              )}
            >
              Unlabeled ({gallery.unlabeled_count})
            </button>
          )}
        </div>
      )}

      {loading && <p className="text-sm text-muted-foreground">Loading images...</p>}

      {!loading && gallery && gallery.items.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ImageIcon className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>No images match this filter.</p>
          </CardContent>
        </Card>
      )}

      {/* Image grid */}
      {gallery && gallery.items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {gallery.items.map((img) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setSelected(img)}
              className="group relative aspect-square rounded-lg overflow-hidden border border-border hover:border-primary/50 transition-colors bg-secondary/30 text-left"
            >
              <AuthenticatedImage
                imageId={img.id}
                alt={img.filename}
                className="w-full h-full object-cover"
              />
              <ImageAnnotationOverlay
                annotations={img.annotations}
                className="absolute inset-0 w-full h-full"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                <p className="text-[10px] text-white truncate">{img.filename}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {img.classes.length === 0 ? (
                    <span className="text-[9px] px-1 rounded bg-yellow-500/80 text-black">unlabeled</span>
                  ) : (
                    img.classes.map((c) => (
                      <span
                        key={c.class_id}
                        className="text-[9px] px-1 rounded text-white"
                        style={{ backgroundColor: c.color }}
                      >
                        {c.name}
                      </span>
                    ))
                  )}
                </div>
              </div>
              <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Eye className="h-4 w-4 text-white drop-shadow" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - pageSize))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">Page {page} / {totalPages}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={offset + pageSize >= total}
            onClick={() => setOffset(offset + pageSize)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Lightbox */}
      {selected && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <Card className="max-w-4xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="text-lg">{selected.filename}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {selected.width}×{selected.height}
                  {selected.quality_score != null && ` · Quality ${(selected.quality_score * 100).toFixed(0)}%`}
                  · {selected.source_type}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative inline-block max-w-full mx-auto">
                <AuthenticatedImage
                  imageId={selected.id}
                  alt={selected.filename}
                  className="max-h-[60vh] w-auto mx-auto rounded border border-border block"
                />
                <ImageAnnotationOverlay annotations={selected.annotations} />
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Labels ({selected.annotations.length})</p>
                {selected.annotations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No annotations on this image.</p>
                ) : (
                  <div className="space-y-2">
                    {selected.annotations.map((ann) => (
                      <div key={ann.id} className="flex flex-wrap items-center gap-2 text-sm p-2 rounded bg-secondary/50">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: ann.class_color }} />
                        <strong>{ann.class_name}</strong>
                        <span className="text-muted-foreground">
                          box ({ann.x_center.toFixed(2)}, {ann.y_center.toFixed(2)})
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-background border border-border">
                          {ann.status}
                        </span>
                        <span className="text-xs text-muted-foreground">{ann.source}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
