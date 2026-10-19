import { describeHostOverride } from "@/features/hosts/model/host-override";
import type { HostOverrideGroup } from "@/shared/types";
import { secondaryButtonClass, toggleButtonClass } from "@/features/hosts/ui/lib/styles";

export interface HostGroupCardProps {
  group: HostOverrideGroup;
  onToggle(): void;
  onEdit(): void;
  onDelete(): void;
}

/** One IP group with its on/off switch, as listed in the editor. */
export function HostGroupCard({ group, onToggle, onEdit, onDelete }: HostGroupCardProps) {
  return (
    <li class="border-zen-line bg-zen-raised flex items-start gap-[var(--zen-space-2)] rounded-[var(--zen-radius)] border p-[var(--zen-space-2)]">
      <button
        type="button"
        class={toggleButtonClass(group.enabled)}
        aria-pressed={group.enabled}
        title={group.enabled ? "Turn this override off" : "Turn this override on"}
        onClick={onToggle}
      >
        {group.enabled ? "On" : "Off"}
      </button>
      <div class="flex min-w-0 flex-1 flex-col gap-[var(--zen-space-1)]">
        <span class="truncate text-[length:var(--zen-text-sm)] font-semibold">
          {describeHostOverride(group)}
          <span class="text-zen-subtle font-normal"> · {group.ip}</span>
        </span>
        <span class="text-zen-faint text-[length:var(--zen-text-xs)] break-all">
          {group.hostnames.join(", ")}
        </span>
      </div>
      <div class="flex gap-[var(--zen-space-1)]">
        <button type="button" class={secondaryButtonClass} onClick={onEdit}>
          Edit
        </button>
        <button
          type="button"
          class={secondaryButtonClass}
          aria-label={`Delete ${describeHostOverride(group)}`}
          onClick={onDelete}
        >
          Delete
        </button>
      </div>
    </li>
  );
}
