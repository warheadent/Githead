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

---

# Workflow Runs Redesign Design QA

Reference Pull Requests screen: `/home/dev/.t3/userdata/attachments/708969d8-ad57-40a9-b069-8a7b120c294a-0383491f-1e31-4800-853d-ee74e838a310.png`

Matched baseline: `artifacts/workflow-runs-before.png`

Matched implementation: `artifacts/workflow-runs-after.png`

Populated implementation: `artifacts/workflow-runs-after-detail.png`

Combined before/after comparison: `artifacts/workflow-runs-before-after.png`

Combined reference/detail comparison: `artifacts/workflow-runs-design-comparison.png`

Viewport and renderer:

- The before and after captures use the same 1920 x 1080 viewport, repository, Workflow Runs tab, top scroll position, no selection, and light appearance.
- The populated capture uses the same viewport and Electron renderer with live public workflow-run data from `warheadent/Githead`.
- The reference/detail comparison keeps each full application view. Its theme and repository content intentionally differ.
- The inspected target exposed `window.githead`; the Vite page was not used as renderer evidence.

## Findings

No actionable P0, P1, or P2 visual difference remains in this scope.

- Layout and hierarchy: the workflow screen now follows the Pull Requests screen's persistent 38/62 list-detail workspace, compact repository header, query toolbar, selected-row treatment, resizable separator, centered unselected state, and detail header.
- List scanning: each row keeps status in a stable leading column, then shows workflow and run number, run title, actor, ref, trigger, relative update time, and duration. Titles clamp and long refs truncate without changing row selection.
- Run investigation: the detail view gives jobs and steps the main space. Run metadata stays in a fixed inspector. The live capture shows completed, active, and pending steps without layout shifts.
- Colors and typography: all layout, borders, selection, text, and status treatments reuse Githead variables and existing type styles. The reference is dark and the test environment is light, so the visible accent differs by the active theme.
- Icons and assets: the screen uses the project's Lucide icon set. No custom SVG, gradient, placeholder asset, or copied GitHub visual was added.
- Interaction and accessibility: rows and job expanders are native buttons with selected or expanded state. Search, filters, sort, refresh, external links, close, logs, cancel confirmation, and re-run actions have accessible names. Closing details restores focus to the selected row.
- Loading and failures: the list keeps the established GitHub loading, empty, stale-data, access, rate-limit, offline, and retry patterns. The detail query adds matching loading, retry, stale-data, and empty-job states.

## Primary Interactions Tested

- Loaded 30 of 449 live workflow runs in the Electron renderer.
- Selected an active run and loaded its run detail, one job, and live step states.
- Confirmed the job expands, the Logs link is present, run metadata is readable, and only the supported Cancel action is shown for the active run.
- Confirmed the compact search, filter, sort, and refresh controls are present and keyboard-accessible.
- Confirmed no renderer console error, page error, or Vite error overlay was present.
- Automated tests covered run selection, detail loading, step rendering, external run and job links, focus restoration, re-run, cancel confirmation, search, API mapping, invalid IDs, and empty POST responses.

## Comparison History

Initial implementation review found no blocking visual defect. The final pass kept the Pull Requests layout rhythm while giving CI jobs and steps more horizontal space than review prose.

final result: passed
