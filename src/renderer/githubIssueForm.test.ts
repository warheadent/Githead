import { describe, expect, it } from "vite-plus/test";
import type { GitHubIssueTemplate } from "../shared/types";
import { serializeIssueForm, validateIssueForm } from "./githubIssueForm";

const template: GitHubIssueTemplate = {
  filename: "bug.yml",
  kind: "form",
  name: "Bug report",
  description: "Report a problem",
  title: "[Bug] ",
  labels: ["bug"],
  assignees: [],
  body: "",
  unsupportedFeatures: [],
  fields: [
    { kind: "input", id: "version", label: "Version", description: "", placeholder: "", defaultValue: "", required: true },
    { kind: "textarea", id: "logs", label: "Logs", description: "", placeholder: "", defaultValue: "", required: false, render: "shell" },
    { kind: "dropdown", id: "severity", label: "Severity", description: "", options: ["Low", "High"], multiple: false, required: true },
    { kind: "checkboxes", id: "terms", label: "Confirmation", description: "", options: [{ label: "I searched existing issues", required: true }] }
  ]
};

describe("GitHub Issue Form answers", () => {
  it("validates required fields and required checkbox options", () => {
    expect(validateIssueForm(template, {})).toBe('Complete "Version".');
    expect(validateIssueForm(template, { version: "1.0", severity: "High" })).toBe('Confirm "I searched existing issues".');
    expect(validateIssueForm(template, { version: "1.0", severity: "High", terms: ["I searched existing issues"] })).toBe("");
  });

  it("serializes answers into the Markdown body used by GitHub", () => {
    expect(serializeIssueForm(template, {
      version: "1.0",
      logs: "npm test",
      severity: "High",
      terms: ["I searched existing issues"]
    })).toBe(`### Version

1.0

### Logs

\`\`\`shell
npm test
\`\`\`

### Severity

High

### Confirmation

- [x] I searched existing issues`);
  });
});
