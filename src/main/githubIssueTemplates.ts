import { parseDocument } from "yaml";
import type {
  GitHubIssueTemplate,
  GitHubIssueTemplateContactLink,
  GitHubIssueTemplateField,
  GitHubIssueTemplates
} from "../shared/types";

const MAX_TEMPLATE_BYTES = 256_000;

export function emptyGitHubIssueTemplates(): GitHubIssueTemplates {
  return { templates: [], blankIssuesEnabled: true, contactLinks: [] };
}

export function parseGitHubIssueTemplate(filename: string, source: string): GitHubIssueTemplate | null {
  if (Buffer.byteLength(source, "utf8") > MAX_TEMPLATE_BYTES) return null;
  if (/\.md$/i.test(filename)) return parseMarkdownTemplate(filename, source);
  if (!/\.ya?ml$/i.test(filename) || /^config\.ya?ml$/i.test(filename)) return null;
  return parseIssueForm(filename, source);
}

export function parseGitHubIssueTemplateConfig(source: string): Pick<GitHubIssueTemplates, "blankIssuesEnabled" | "contactLinks"> {
  if (Buffer.byteLength(source, "utf8") > MAX_TEMPLATE_BYTES) return { blankIssuesEnabled: true, contactLinks: [] };
  const value = parseYamlRecord(source);
  if (!value) return { blankIssuesEnabled: true, contactLinks: [] };
  const contactLinks = Array.isArray(value.contact_links)
    ? value.contact_links.flatMap((entry): GitHubIssueTemplateContactLink[] => {
      const link = asRecord(entry);
      const name = asString(link?.name);
      const url = asString(link?.url);
      if (!name || !isHttpUrl(url)) return [];
      return [{ name, url, description: asString(link?.about) }];
    })
    : [];
  return {
    blankIssuesEnabled: value.blank_issues_enabled !== false,
    contactLinks
  };
}

function parseIssueForm(filename: string, source: string): GitHubIssueTemplate | null {
  const value = parseYamlRecord(source);
  if (!value) return null;
  const name = asString(value.name);
  const description = asString(value.description);
  const rawBody = Array.isArray(value.body) ? value.body : [];
  if (!name || !description || rawBody.length === 0) return null;

  const fields = rawBody.flatMap(parseFormField);
  if (fields.length === 0) return null;
  const unsupportedFeatures: string[] = [];
  if (value.projects !== undefined) unsupportedFeatures.push("projects");
  if (value.type !== undefined) unsupportedFeatures.push("issue type");
  for (const entry of rawBody) {
    const field = asRecord(entry);
    const type = asString(field?.type);
    if (type && !["markdown", "input", "textarea", "dropdown", "checkboxes"].includes(type)) unsupportedFeatures.push(type);
  }
  return {
    filename,
    kind: "form",
    name,
    description,
    title: asText(value.title),
    labels: asStringList(value.labels),
    assignees: asStringList(value.assignees),
    body: "",
    fields,
    unsupportedFeatures: [...new Set(unsupportedFeatures)]
  };
}

function parseFormField(entry: unknown): GitHubIssueTemplateField[] {
  const field = asRecord(entry);
  if (!field) return [];
  const kind = asString(field.type);
  const attributes = asRecord(field.attributes) ?? {};
  if (kind === "markdown") {
    const value = asText(attributes.value);
    return value ? [{ kind, value }] : [];
  }
  const id = asString(field.id);
  const label = asString(attributes.label);
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id) || !label) return [];
  const validations = asRecord(field.validations) ?? {};
  const description = asString(attributes.description);
  if (kind === "input" || kind === "textarea") {
    const render = kind === "textarea" ? asString(attributes.render) : "";
    return [{
      kind,
      id,
      label,
      description,
      placeholder: asText(attributes.placeholder),
      defaultValue: asText(attributes.value),
      required: validations.required === true,
      ...(render ? { render } : {})
    }];
  }
  if (kind === "dropdown") {
    const options = asStringList(attributes.options);
    return options.length ? [{ kind, id, label, description, options, multiple: attributes.multiple === true, required: validations.required === true }] : [];
  }
  if (kind === "checkboxes") {
    const options = Array.isArray(attributes.options)
      ? attributes.options.flatMap((option) => {
        if (typeof option === "string") return [{ label: option, required: false }];
        const value = asRecord(option);
        const optionLabel = asString(value?.label);
        return optionLabel ? [{ label: optionLabel, required: value?.required === true }] : [];
      })
      : [];
    return options.length ? [{ kind, id, label, description, options }] : [];
  }
  return [];
}

function parseMarkdownTemplate(filename: string, source: string): GitHubIssueTemplate | null {
  let metadata: Record<string, unknown> = {};
  let body = source;
  const frontmatter = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  if (frontmatter) {
    metadata = parseYamlRecord(frontmatter[1] ?? "") ?? {};
    body = source.slice(frontmatter[0].length);
  }
  return {
    filename,
    kind: "markdown",
    name: asString(metadata.name) || humanizeFilename(filename),
    description: asString(metadata.about),
    title: asText(metadata.title),
    labels: asStringList(metadata.labels),
    assignees: asStringList(metadata.assignees),
    body,
    fields: [],
    unsupportedFeatures: []
  };
}

function parseYamlRecord(source: string): Record<string, unknown> | null {
  try {
    const document = parseDocument(source, { merge: false, prettyErrors: false });
    if (document.errors.length > 0) return null;
    return asRecord(document.toJS({ maxAliasCount: 20 }));
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringList(value: unknown): string[] {
  if (typeof value === "string") return value.split(",").map((entry) => entry.trim()).filter(Boolean);
  return Array.isArray(value) ? value.flatMap((entry) => typeof entry === "string" && entry.trim() ? [entry.trim()] : []) : [];
}

function humanizeFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
