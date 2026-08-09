# Pull Request List Follow-up Design QA

Source visual truth: `/home/dev/.t3/userdata/attachments/0a26aa63-31bd-4dbd-be2a-1d46add4f9d2-23362c9f-03e9-47b8-8599-8a55e01f5b15.png`

Implementation screenshot: `/home/dev/src/Githead/artifacts/pull-request-left-followup-after.png`

Combined comparison: `/home/dev/src/Githead/artifacts/design-qa-left-followup-comparison.png`

Additional filter-control evidence: `/home/dev/src/Githead/artifacts/pull-request-filters-followup-after.png`

Viewport and normalization:

- Source focused list: 838 x 946 pixels.
- Electron renderer: 2129 x 1098 CSS pixels at device scale factor 1.
- Captured implementation list panel: 631.172 x 925.766 CSS pixels; PNG output 631 x 925 pixels.
- The focused comparison keeps the source at its native 946-pixel height and scales the implementation from 925 to 946 display pixels. The different panel widths are retained because the source and renderer use different application viewports.
- Combined comparison: 1600 x 1000 pixels.

State:

- Dark appearance.
- Pull-request list open with no selected row.
- Top of the list, with live public pull-request data from a temporary local repository.
- The repository, count, titles, authors, times, and labels intentionally differ from the reference.
- `window.githead` was present in the inspected Electron renderer.

## Findings

No actionable P0, P1, or P2 differences remain for this follow-up scope.

- Fonts and typography: existing Githead type styles remain unchanged. Pull-request titles still clamp to two lines. Label text now remains complete and wraps instead of using an ellipsis.
- Spacing and layout rhythm: the inline Sort label has an 8-pixel gap before its select control. Preset, Label, and Draft fields in the Filters popover have an 8-pixel label-to-control gap. The removed row action leaves a clean single-column row without an empty action track.
- Colors and visual tokens: all changes continue to use the active Githead theme variables. The source's violet accent and the captured environment's green accent differ because no new colors were introduced.
- Image and icon fidelity: the list keeps the existing Lucide state, comment, filter, refresh, and select icons. No raster assets, custom SVGs, gradients, or placeholder graphics were added.
- Copy and content: no user-facing copy changed. The visible implementation labels, including `CLA Signed`, `Resolution: Stale`, and `React Core Team`, are complete.
- Interaction and accessibility: the full row remains a native keyboard-selectable button. The small selector-row checkout button is absent. The populated review console still owns the existing checkout callback and was not redesigned.

The focused comparison is the left list pane because all requested corrections are in this region. The additional Filters-popover screenshot makes the dropdown label spacing readable at full captured size.

## Comparison History

Initial findings:

- A small checkout/download icon appeared at the far right of every selector row.
- Label chips used a 78-pixel ellipsis limit, which hid label text.
- The inline Sort label and popover field labels sat too close to their controls.

Fixes made:

- Removed only the selector-row checkout control and its action grid track. Checkout handling in the populated review console remains unchanged.
- Added pull-request-row label rules that allow up to two labels to wrap and remain fully readable.
- Increased the Sort and advanced-filter label-to-control gaps to 8 pixels.

Post-fix evidence:

- `/home/dev/src/Githead/artifacts/pull-request-left-followup-after.png`
- `/home/dev/src/Githead/artifacts/pull-request-filters-followup-after.png`
- `/home/dev/src/Githead/artifacts/design-qa-left-followup-comparison.png`

## Primary Interactions Tested

- Opened and closed the Filters popover in the Electron renderer.
- Confirmed all three popover field gaps compute to 8 pixels.
- Confirmed the inline Sort gap computes to 8 pixels.
- Confirmed no selector-row checkout controls remain.
- Confirmed long live labels render without ellipses.
- Confirmed the renderer exposes `window.githead` and has no Vite error overlay.

Console errors checked: no renderer errors or warnings were reported after the final interaction state.

## Implementation Checklist

- [x] Remove the small selector-row checkout button.
- [x] Keep up to two labels fully readable.
- [x] Add clear spacing between dropdown labels and controls.
- [x] Preserve row selection and the populated review console checkout path.
- [x] Preserve existing theme variables and icons.

## Follow-up Polish

No blocking follow-up polish remains in the requested scope.

final result: passed
