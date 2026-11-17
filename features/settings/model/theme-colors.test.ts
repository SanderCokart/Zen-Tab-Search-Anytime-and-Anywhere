import { describe, expect, it } from "vitest";
import { themeColorStyle } from "@/features/settings/model/theme-colors";

const AUTO = {
  accentColor: "auto",
  chassisColor: "auto",
  panelColor: "auto",
  textColor: "auto",
} as const;

describe("themeColorStyle", () => {
  it("emits nothing while every colour is left to the theme", () => {
    expect(themeColorStyle("light", AUTO)).toEqual({});
    expect(themeColorStyle("dark", AUTO)).toEqual({});
  });

  it("writes the accent and derives ink and glow from it", () => {
    expect(themeColorStyle("light", { ...AUTO, accentColor: "#e0943a" })).toEqual({
      "--zs-red": "#e0943a",
      "--zs-red-ink": "color-mix(in srgb, #e0943a 80%, black)",
      "--zs-red-glow": "color-mix(in srgb, #e0943a 55%, transparent)",
    });
    expect(themeColorStyle("dark", { ...AUTO, accentColor: "#e0943a" })["--zs-red-ink"]).toBe(
      "color-mix(in srgb, #e0943a 80%, white)",
    );
  });

  it("writes the frame and derives hair and line toward the theme's edge", () => {
    expect(themeColorStyle("light", { ...AUTO, chassisColor: "#161311" })).toEqual({
      "--zs-chassis": "#161311",
      "--zs-hair": "color-mix(in srgb, #161311 92%, black)",
      "--zs-line": "color-mix(in srgb, #161311 82%, black)",
    });
    expect(themeColorStyle("dark", { ...AUTO, chassisColor: "#161311" })["--zs-hair"]).toBe(
      "color-mix(in srgb, #161311 92%, white)",
    );
  });

  it("writes the panel and derives the raised, pressed and key steps", () => {
    expect(themeColorStyle("light", { ...AUTO, panelColor: "#221c19" })).toEqual({
      "--zs-card": "#221c19",
      "--zs-card-hi": "color-mix(in srgb, #221c19 40%, white)",
      "--zs-pressed": "color-mix(in srgb, #221c19 90%, black)",
      "--zs-key": "color-mix(in srgb, #221c19 96%, black)",
      "--zs-key-edge": "color-mix(in srgb, #221c19 82%, black)",
    });
    expect(themeColorStyle("dark", { ...AUTO, panelColor: "#221c19" })).toEqual({
      "--zs-card": "#221c19",
      "--zs-card-hi": "color-mix(in srgb, #221c19 88%, white)",
      "--zs-pressed": "color-mix(in srgb, #221c19 92%, black)",
      "--zs-key": "color-mix(in srgb, #221c19 88%, white)",
      "--zs-key-edge": "color-mix(in srgb, #221c19 40%, black)",
    });
  });

  it("writes the text and mixes the quieter inks toward the panel", () => {
    expect(
      themeColorStyle("dark", { ...AUTO, textColor: "#f6f1e8", panelColor: "#221c19" }),
    ).toMatchObject({
      "--zs-ink-1": "#f6f1e8",
      "--zs-ink-2": "color-mix(in srgb, #f6f1e8 70%, #221c19)",
      "--zs-ink-3": "color-mix(in srgb, #f6f1e8 50%, #221c19)",
    });
  });

  it("mixes quieter inks toward the theme's card while the panel is auto", () => {
    expect(themeColorStyle("light", { ...AUTO, textColor: "#161616" })["--zs-ink-2"]).toBe(
      "color-mix(in srgb, #161616 70%, #fafaf8)",
    );
    expect(themeColorStyle("dark", { ...AUTO, textColor: "#ededea" })["--zs-ink-3"]).toBe(
      "color-mix(in srgb, #ededea 50%, #1b1b1b)",
    );
  });
});
