// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { VisualEffectsProvider, useVisualEffects } from "./VisualEffects";

function Probe() {
  const { reduceMotion } = useVisualEffects();
  return <output>{String(reduceMotion)}</output>;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("follows system changes and keeps Always reduced when the system allows motion", () => {
  const target = new EventTarget();
  const media = { matches: false, addEventListener: target.addEventListener.bind(target), removeEventListener: target.removeEventListener.bind(target) };
  vi.stubGlobal("matchMedia", () => media);
  const view = render(<VisualEffectsProvider effects="standard" motionPreference="system"><Probe /></VisualEffectsProvider>);
  expect(view.getByRole("status").textContent).toBe("false");
  act(() => { media.matches = true; target.dispatchEvent(new Event("change")); });
  expect(document.documentElement.dataset.reduceMotion).toBe("true");
  expect(view.getByRole("status").textContent).toBe("true");
  view.rerender(<VisualEffectsProvider effects="off" motionPreference="always"><Probe /></VisualEffectsProvider>);
  act(() => { media.matches = false; target.dispatchEvent(new Event("change")); });
  expect(document.documentElement.dataset.reduceMotion).toBe("true");
  expect(document.documentElement.dataset.visualEffects).toBe("off");
  view.rerender(<VisualEffectsProvider effects="full" motionPreference="system"><Probe /></VisualEffectsProvider>);
  expect(document.documentElement.dataset.reduceMotion).toBe("false");
});
