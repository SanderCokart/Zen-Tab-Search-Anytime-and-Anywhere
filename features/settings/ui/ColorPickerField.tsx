import { useEffect, useRef, useState } from "preact/hooks";
import Pickr from "@simonwep/pickr";
import "@simonwep/pickr/dist/themes/nano.min.css";

interface ColorPickerFieldProps {
  label: string;
  color: string;
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
    const commit = (next: Pickr.HSVaColor) => {
      onChangeRef.current(toHex(next));
    };
    pickr.on("changestop", () => commit(pickr.getColor()));
    pickr.on("change", (next: Pickr.HSVaColor, source: string) => {
      if (source === "input" || source === "swatch") {
        commit(next);
      }
    });
    pickr.on("show", () => setOpen(true));
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
      class="h-8 w-14 cursor-pointer rounded border border-black/30 p-0 shadow-inner"
      style={{ backgroundColor: color }}
      disabled={disabled}
      aria-label={`Choose ${label.toLowerCase()}`}
      aria-expanded={open}
    />
  );
}
