import { TextPromptDialog } from "@/features/search/ui/components/TextPromptDialog";
import type { TabInfo } from "@/shared/types";

export interface RenameTabDialogProps {
  tab: TabInfo;
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

/** Modal for renaming a tab's Zen label (or an essential tab's local name). */
export function RenameTabDialog({
  value,
  error,
  onChange,
  onSubmit,
  onCancel,
}: RenameTabDialogProps) {
  return (
    <TextPromptDialog
      title="Rename tab"
      fieldLabel="Tab name"
      value={value}
      error={error}
      onChange={onChange}
      onSubmit={(name) => onSubmit(name.replace(/\s+/g, " ").trim())}
      onCancel={onCancel}
    />
  );
}
