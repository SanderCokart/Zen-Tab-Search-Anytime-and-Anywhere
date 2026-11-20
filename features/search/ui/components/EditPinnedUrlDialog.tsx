import { TextPromptDialog } from "@/features/search/ui/components/TextPromptDialog";

export interface EditPinnedUrlDialogProps {
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  onSubmit: (url: string) => void;
  onCancel: () => void;
}

/** Modal for editing a pinned or essential tab's stored URL, matching Zen's prompt. */
export function EditPinnedUrlDialog({
  value,
  error,
  onChange,
  onSubmit,
  onCancel,
}: EditPinnedUrlDialogProps) {
  return (
    <TextPromptDialog
      title="Edit pinned URL"
      fieldLabel="URL"
      value={value}
      error={error}
      onChange={onChange}
      onSubmit={(url) => onSubmit(url.trim())}
      onCancel={onCancel}
    />
  );
}
