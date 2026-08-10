import { describe, expect, it } from "vite-plus/test";
import { parseGitHubIssueTemplate, parseGitHubIssueTemplateConfig } from "./githubIssueTemplates";

describe("GitHub issue templates", () => {
  it("parses supported Issue Form fields and reports unsupported metadata", () => {
    const template = parseGitHubIssueTemplate("bug.yml", `
name: Bug report
description: Tell us what broke
title: "[Bug] "
labels: [bug, needs-triage]
assignees: [octocat]
projects: [octo/1]
body:
  - type: markdown
    attributes:
      value: "Thanks for helping."
  - type: input
    id: version
    attributes:
      label: Version
      placeholder: 1.2.3
    validations:
      required: true
  - type: textarea
    id: logs
    attributes:
      label: Logs
      render: shell
  - type: dropdown
    id: severity
    attributes:
      label: Severity
      options: [Low, High]
  - type: checkboxes
    id: terms
    attributes:
      label: Confirmation
      options:
        - label: I searched existing issues
          required: true
`);

    expect(template).toMatchObject({
      kind: "form",
      name: "Bug report",
      title: "[Bug] ",
      labels: ["bug", "needs-triage"],
      assignees: ["octocat"],
      unsupportedFeatures: ["projects"],
      fields: [
        { kind: "markdown", value: "Thanks for helping." },
        { kind: "input", id: "version", required: true },
        { kind: "textarea", id: "logs", render: "shell" },
        { kind: "dropdown", id: "severity", options: ["Low", "High"] },
        { kind: "checkboxes", id: "terms", options: [{ label: "I searched existing issues", required: true }] }
      ]
    });
  });

  it("parses classic Markdown frontmatter and preserves its body", () => {
    const template = parseGitHubIssueTemplate("feature.md", `---
name: Feature request
about: Suggest an improvement
title: "[Feature] "
labels: enhancement, discussion
assignees: octocat
---
## Problem

Describe the problem.
`);
    expect(template).toMatchObject({
      kind: "markdown",
      name: "Feature request",
      description: "Suggest an improvement",
      title: "[Feature] ",
      labels: ["enhancement", "discussion"],
      assignees: ["octocat"],
      body: "## Problem\n\nDescribe the problem.\n"
    });
  });

  it("respects blank issue and safe contact-link configuration", () => {
    expect(parseGitHubIssueTemplateConfig(`
blank_issues_enabled: false
contact_links:
  - name: Support
    url: https://example.com/support
    about: Ask a question
  - name: Unsafe
    url: javascript:alert(1)
`)).toEqual({
      blankIssuesEnabled: false,
      contactLinks: [{ name: "Support", url: "https://example.com/support", description: "Ask a question" }]
    });
  });
});
