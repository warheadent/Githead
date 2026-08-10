import type { GitHubIssueTemplate } from "../shared/types";

export type GitHubIssueFormAnswers = Record<string, string | string[]>;

export function initialIssueFormAnswers(template: GitHubIssueTemplate): GitHubIssueFormAnswers {
  const answers: GitHubIssueFormAnswers = {};
  for (const field of template.fields) {
    if (field.kind === "markdown") continue;
    answers[field.id] = field.kind === "checkboxes" || (field.kind === "dropdown" && field.multiple)
      ? []
      : field.kind === "input" || field.kind === "textarea" ? field.defaultValue : "";
  }
  return answers;
}

export function validateIssueForm(template: GitHubIssueTemplate, answers: GitHubIssueFormAnswers): string {
  for (const field of template.fields) {
    if (field.kind === "markdown") continue;
    const answer = answers[field.id];
    if ((field.kind === "input" || field.kind === "textarea") && field.required && !stringAnswer(answer).trim()) return `Complete “${field.label}”.`;
    if (field.kind === "dropdown" && field.required && listAnswer(answer).length === 0 && !stringAnswer(answer)) return `Choose an option for “${field.label}”.`;
    if (field.kind === "checkboxes") {
      const selected = listAnswer(answer);
      const missing = field.options.find((option) => option.required && !selected.includes(option.label));
      if (missing) return `Confirm “${missing.label}”.`;
    }
  }
  return "";
}

export function serializeIssueForm(template: GitHubIssueTemplate, answers: GitHubIssueFormAnswers): string {
  return template.fields.flatMap((field) => {
    if (field.kind === "markdown") return [];
    const heading = `### ${field.label}`;
    if (field.kind === "checkboxes") {
      const selected = listAnswer(answers[field.id]);
      return [`${heading}\n\n${field.options.map((option) => `- [${selected.includes(option.label) ? "x" : " "}] ${option.label}`).join("\n")}`];
    }
    const raw = field.kind === "dropdown" && field.multiple
      ? listAnswer(answers[field.id]).join(", ")
      : stringAnswer(answers[field.id]).trim();
    const value = raw || "_No response_";
    if (field.kind === "textarea" && field.render && raw) return [`${heading}\n\n\`\`\`${field.render}\n${raw}\n\`\`\``];
    return [`${heading}\n\n${value}`];
  }).join("\n\n");
}

function stringAnswer(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

function listAnswer(value: string | string[] | undefined): string[] {
  return Array.isArray(value) ? value : value ? [value] : [];
}
