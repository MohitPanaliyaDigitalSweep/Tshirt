import { useState, useEffect, useCallback } from 'react';
import { Card, ErrorBox, PageTitle, btnPrimary, btnGhost, inputCls } from '../components/ui';
import { ApiError, getOrder, type Order, type DesignSnapshot, exportDesign, useOrder } from '../lib/api';
import { useNavigate, useParams } from 'react-router-dom';

export default function DesignExport() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportData, setExportData] = useState<DesignExport | null>(null);
  const { order } = useOrder();

  const triggerExport = useCallback(async () => {
    if (!id) {
      setError('Order ID is required');
      return;
    }
    setLoading(true);
    setError(null);
    setExportData(null);
    try {
      const data = await exportDesign(id);
      setExportData(data);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Export failed');
    } finally {
      setLoading(false);
    }
  }, [id]);

  return (
    <section className="mx-auto max-w-3xl p-4 sm:p-6">
      <PageTitle eyebrow="Export" title="Design Export" sub="Export your design snapshot" />
      
      {order && (
        <div className="mb-4">
          <p className="text-sm text-muted">
            Order <span className="font-medium text-champagne">#{order.id}</span> - 
            Status: <span className="StatusBadge status={order.status}" />
          </p>
        </div>
      )}

      <Card>
        <form className="grid gap-4" onSubmit={triggerExport}>
          <div>
            <button
              type="submit"
              disabled={loading}
              className={btnPrimary}
            >
              {loading ? 'Generating…' : 'Export Design'}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void window.history.back()}
              className={btnGhost}
            >
              Cancel
            </button>
          </div>
        </form>
      </Card>

      {error && <ErrorBox message={error} onDismiss={() => setError(null)} />}

      {exportData && (
        <div className="mt-6 p-4 rounded-[6px] border border-rule bg-lacquer-deep">
          <h3 className="font-[family-name:var(--font-display)] text-champagne mb-2">
            {exportData.success ? 'Success' : 'Failed'}
          </h3>
          
          {exportData.message && (
            <p className="text-sm text-muted mb-3">{exportData.message}</p>
          )}

          {exportData.snapshot && (
            <div className="space-y-3 text-xs text-muted">
              <p><strong>Version:</strong> {exportData.snapshot.version || 'N/A'}</p>
              <p><strong>Color:</strong> {exportData.snapshot.color || 'N/A'}</p>
              <p><strong>Material ID:</strong> {exportData.snapshot.material_id || 'N/A'}</p>
              
              <p><strong>Zones:</strong> {Object.keys(exportData.snapshot.zones || {}).length} zones</p>
              
              {exportData.snapshot.views && (
                <p><strong>Views:</strong> Front={exportData.snapshot.views.front?.items?.length || 0}, 
                Back={exportData.snapshot.views.back?.items?.length || 0}</p>
              )}
              
              <p><strong>Thumbs:</strong> Front={exportData.snapshot.thumbs?.front || 'none'}, 
              Back={exportData.snapshot.thumbs?.back || 'none'}</p>
            )
          }}
          
          {exportData.image_url && (
            <a href={exportData.image_url} target="_blank" rel="noopener noreferrer" className="mt-2 text-gold hover:text-gold-pale">
              View Exported Image
            </a>
          )}

          {exportData.download_url && (
            <a href={exportData.download_url} download className="mt-2 text-gold hover:text-gold-pale">
              Download Design Snapshot
            </a>
          )}
        </div>
      )}
    </section>
  );
}
