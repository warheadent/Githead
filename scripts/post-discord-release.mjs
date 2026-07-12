const MAX_DESCRIPTION_LENGTH = 4_096;

const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
const releaseNotes = process.env.RELEASE_NOTES?.trim();
const releaseTag = process.env.RELEASE_TAG?.trim();
const releaseUrl = process.env.RELEASE_URL?.trim();

if (!webhookUrl) {
  console.log("DISCORD_WEBHOOK_URL is not configured; skipping Discord notification.");
  process.exit(0);
}

if (!releaseNotes || !releaseTag || !releaseUrl) {
  fail("RELEASE_NOTES, RELEASE_TAG, and RELEASE_URL are required.");
}

const description = truncateMarkdown(stripLeadingTitle(releaseNotes), MAX_DESCRIPTION_LENGTH);
const response = await fetch(webhookUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: `Githead ${releaseTag}`,
        description,
        url: releaseUrl,
        color: 0x58b7ff
      }
    ]
  }),
  signal: AbortSignal.timeout(15_000)
});

if (!response.ok) {
  const responseText = await response.text();
  fail(`Discord webhook failed with ${response.status}: ${responseText.slice(0, 1_000)}`);
}

console.log(`Posted ${releaseTag} release notes to Discord.`);

function stripLeadingTitle(markdown) {
  return markdown.replace(/^#\s+[^\r\n]+\r?\n+/, "").trim();
}

function truncateMarkdown(markdown, maxLength) {
  const characters = Array.from(markdown);
  if (characters.length <= maxLength) {
    return markdown;
  }

  return `${characters.slice(0, maxLength - 3).join("")}...`;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
