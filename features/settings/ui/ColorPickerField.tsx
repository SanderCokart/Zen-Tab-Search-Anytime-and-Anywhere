import { useEffect, useRef, useState } from "preact/hooks";
import Pickr from "@simonwep/pickr";
import "@simonwep/pickr/dist/themes/nano.min.css";
import "@/shared/ui/hardware/pickr.css";

interface ColorPickerFieldProps {
  label: string;
  color: string;
  /** Shown on the key beside the swatch, such as AUTO or the hex value. */
  caption?: string;
  disabled?: boolean;
  onChange: (color: string) => void;
}

function toHex(color: Pickr.HSVaColor): string {
  const [r, g, b] = color.toRGBA();
  return `#${[r, g, b]
    .map((value) => Math.round(Number(value)).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function ColorPickerField({
  label,
  color,
  caption,
  disabled = false,
  onChange,
}: ColorPickerFieldProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pickrRef = useRef<Pickr>();
  const onChangeRef = useRef(onChange);
  const [open, setOpen] = useState(false);
  onChangeRef.current = onChange;

  useEffect(() => {
    const button = buttonRef.current;
    if (!button) {
      return;
    }

    const pickr = Pickr.create({
      el: button,
      theme: "nano",
      useAsButton: true,
      default: color,
      defaultRepresentation: "HEXA",
      lockOpacity: true,
      comparison: false,
      closeWithKey: "Escape",
      components: {
        preview: true,
        opacity: false,
        hue: true,
        interaction: {
          hex: true,
          rgba: true,
          hsla: true,
          input: true,
        },
      },
    });
    // The colour shown when the picker opened, or last saved while it was open.
    // Closing the picker saves only a colour the user actually changed:
    // committing on every close saved an auto colour's theme swatch as a fixed
    // colour, which then stuck when the theme changed.
    let committed = "";
    const commit = (next: Pickr.HSVaColor) => {
      const hex = toHex(next);
      if (hex.toLowerCase() === committed.toLowerCase()) return;
      committed = hex;
      onChangeRef.current(hex);
    };
    pickr.on("changestop", () => commit(pickr.getColor()));
    pickr.on("change", (next: Pickr.HSVaColor, source: string) => {
      if (source === "input" || source === "swatch") {
        commit(next);
      }
    });
    pickr.on("show", () => {
      committed = toHex(pickr.getColor());
      setOpen(true);
    });
    pickr.on("hide", () => {
      commit(pickr.getColor());
      setOpen(false);
    });
    pickrRef.current = pickr;
    return () => {
      pickr.destroyAndRemove();
      pickrRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    if (pickrRef.current?.isOpen()) {
      return;
    }
    pickrRef.current?.setColor(color, true);
  }, [color]);

  useEffect(() => {
    const pickr = pickrRef.current;
    if (!pickr) {
      return;
    }
    if (disabled) {
      pickr.disable();
    } else {
      pickr.enable();
    }
  }, [disabled]);

  return (
    <button
      ref={buttonRef}
      type="button"
      class="zs-key flex items-center gap-[var(--zen-space-2)] p-[var(--zen-space-1)] font-[inherit] disabled:cursor-not-allowed"
      disabled={disabled}
      aria-label={`Choose ${label.toLowerCase()}`}
      aria-expanded={open}
    >
      <i
        class="block size-[calc(var(--zen-font-size)*1.7)] rounded-[calc(var(--zen-font-size)*0.45)] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.15)]"
        style={{ backgroundColor: color }}
      />
      {caption && (
        <span class="pr-[var(--zen-space-1)] text-[length:calc(var(--zen-font-size)*0.77)] tracking-[0.12em] text-[var(--zs-ink-2)]">
          {caption}
        </span>
      )}
    </button>
  );
}
