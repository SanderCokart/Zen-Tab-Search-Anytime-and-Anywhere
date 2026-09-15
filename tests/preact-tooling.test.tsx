import { h } from "preact";
import { describe, expect, it } from "vitest";

describe("preact tooling", () => {
  it("compiles JSX with the Preact automatic runtime", () => {
    const vnode = <span class="zen-preact-smoke">ok</span>;

    expect(vnode.type).toBe("span");
    expect(vnode.props).toEqual({ class: "zen-preact-smoke", children: "ok" });
    expect(h).toEqual(expect.any(Function));
  });
});
