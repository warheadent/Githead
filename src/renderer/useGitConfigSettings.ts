import { useCallback, useEffect, useRef, useState } from "react";
import {
  changedGitConfigValues, emptyGitConfigValues,
  type GitConfigScope, type GitConfigSettings, type GitConfigValues
} from "../shared/gitConfig";

export function useGitConfigSettings(open: boolean, repoPath: string, scope: GitConfigScope) {
  const [settings, setSettings] = useState<GitConfigSettings | null>(null);
  const [draft, setDraft] = useState<GitConfigValues>(emptyGitConfigValues);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const busyRef = useRef(false);
  const dirty = settings !== null && Object.keys(changedGitConfigValues(settings.values, draft)).length > 0;

  const reload = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const next = await window.githead.getGitConfig({ repoPath, scope });
      if (generation.current !== current) return;
      setSettings(next);
      setDraft(next.values);
    } catch (cause) {
      if (generation.current === current) setError(cause instanceof Error ? cause.message : "Unable to load Git configuration.");
    } finally {
      if (generation.current === current) setLoading(false);
    }
  }, [repoPath, scope]);

  useEffect(() => {
    setSettings(null);
    setDraft(emptyGitConfigValues());
    setError("");
    setSaving(false);
    busyRef.current = false;
    if (open) void reload();
    return () => { generation.current += 1; };
  }, [open, reload]);

  const save = async (): Promise<boolean> => {
    if (busyRef.current) return false;
    if (!dirty || !settings) return true;
    const current = generation.current;
    busyRef.current = true;
    setSaving(true);
    setError("");
    try {
      const next = await window.githead.saveGitConfig({
        repoPath, scope, revision: settings.revision,
        changes: changedGitConfigValues(settings.values, draft), operationId: `git-config-${crypto.randomUUID()}`
      });
      if (generation.current !== current) return false;
      setSettings(next);
      setDraft(next.values);
      return true;
    } catch (cause) {
      if (generation.current === current) setError(cause instanceof Error ? cause.message : "Unable to save Git configuration.");
      return false;
    } finally {
      if (generation.current === current) {
        busyRef.current = false;
        setSaving(false);
      }
    }
  };

  return { settings, draft, setDraft, loading, saving, error, dirty, reload, save };
}

export type GitConfigEditorState = ReturnType<typeof useGitConfigSettings>;
