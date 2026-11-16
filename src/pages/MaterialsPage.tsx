import { useState } from 'react';
import type { Material } from '../api/materials';
import { describeAuthError } from '../auth/authForm';
import { useAsyncAction } from '../auth/useAsyncAction';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { MaterialDropzone } from '../components/MaterialDropzone';
import { MaterialItem } from '../components/MaterialItem';
import { UploadList } from '../components/UploadList';
import { MATERIAL_FORMATS_TEXT, MESSAGES } from '../constants';
import { useDeleteMaterial, useMaterials, useRefreshMaterials } from '../materials/hooks';
import { useUploadQueue } from '../materials/useUploadQueue';

export function MaterialsPage() {
  const materials = useMaterials();
  const refresh = useRefreshMaterials();
  const maxBytes = materials.data?.limits.maxUploadBytes;
  const uploads = useUploadQueue(maxBytes ?? 0, () => void refresh());

  const [deleting, setDeleting] = useState<Material | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const remove = useDeleteMaterial();
  const deleteAction = useAsyncAction();

  const closeDialog = () => {
    setDeleting(null);
    setDeleteError(null);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteError(null);
    const target = deleting;
    const result = await deleteAction.run(() => remove.mutateAsync(target.id));
    if (!result) return;
    if (result.ok) {
      closeDialog();
      setNotice(`Deleted “${target.name}”.`);
      return;
    }
    setDeleteError(describeAuthError(result.error).form ?? MESSAGES.generic);
  };

  const items = materials.data?.items;

  return (
    <>
      <section className="card" aria-labelledby="page-heading">
        <h1 id="page-heading">Materials</h1>
        <p>Upload study files. The text is read and kept for summaries and quizzes; the original file is not stored.</p>
        {maxBytes !== undefined && <MaterialDropzone maxBytes={maxBytes} onFiles={uploads.enqueue} />}
        <p role="status" aria-live="polite" className="text-muted">
          {uploads.notice}
        </p>
        <UploadList rows={uploads.rows} onRetry={uploads.retry} onDismiss={uploads.dismiss} onClearFinished={uploads.clearFinished} />
      </section>

      <section className="card" aria-label="Your materials" aria-busy={materials.isFetching}>
        <h2>Your materials</h2>
        <p role="status" aria-live="polite" className="text-muted task-notice">
          {notice}
        </p>

        {materials.isPending && <p role="status">Loading materials…</p>}

        {materials.isError && (
          <div role="alert" className="notice">
            <p>{describeAuthError(materials.error).form ?? MESSAGES.generic}</p>
            <button type="button" className="button" onClick={() => void materials.refetch()}>
              Retry
            </button>
          </div>
        )}

        {items && items.length === 0 && <p>You have no materials yet. Upload a {MATERIAL_FORMATS_TEXT} file above to get started.</p>}

        {items && items.length > 0 && (
          <ul className="material-list">
            {items.map((material) => (
              <MaterialItem key={material.id} material={material} onDelete={() => setDeleting(material)} />
            ))}
          </ul>
        )}
      </section>

      {deleting && (
        <ConfirmDialog
          title="Delete this material?"
          confirmLabel="Delete material"
          pendingLabel="Deleting…"
          pending={deleteAction.pending}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={closeDialog}
        >
          <p>“{deleting.name}” and its extracted text will be permanently deleted. This cannot be undone.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
