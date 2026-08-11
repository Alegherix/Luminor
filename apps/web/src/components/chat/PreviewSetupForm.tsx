// FILE: PreviewSetupForm.tsx
// Purpose: Inline preview configuration inside the preview pane - one command, an optional
//          URL template, saved and started in a single submit.
// Layer: Chat right-dock UI
// Exports: PreviewSetupForm

import { useId, useState, type FormEvent } from "react";

import type { PreviewCommandSuggestion } from "~/previewCommandSuggestions";
import { projectScriptUrlTemplateOrNull, type PreviewProjectScriptDraft } from "~/projectScripts";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

export const PREVIEW_COMMAND_REQUIRED_MESSAGE = "A preview command is required.";
export const PREVIEW_COMMAND_SUGGESTIONS_HINT = "From package.json";
export const PREVIEW_SETUP_SUBMIT_LABEL = "Save and start preview";
export const PREVIEW_URL_TEMPLATE_PLACEHOLDER = "http://localhost:{port}";
export const PREVIEW_URL_TEMPLATE_HINT =
  "Optional. {port} is replaced with the preview's port. Leave it empty to use the URL the command prints.";

export function PreviewSetupForm(props: {
  heading: string;
  description: string;
  commandSuggestions?: readonly PreviewCommandSuggestion[];
  onSubmit: (draft: PreviewProjectScriptDraft) => Promise<void>;
}) {
  const commandFieldId = useId();
  const urlTemplateFieldId = useId();
  const [command, setCommand] = useState("");
  const [urlTemplate, setUrlTemplate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const suggestions = props.commandSuggestions ?? [];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedCommand = command.trim();
    if (trimmedCommand.length === 0) {
      setError(PREVIEW_COMMAND_REQUIRED_MESSAGE);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await props.onSubmit({
        command: trimmedCommand,
        urlTemplate: projectScriptUrlTemplateOrNull(urlTemplate),
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Failed to save the preview command.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
      <form className="w-full max-w-80 space-y-4" onSubmit={submit}>
        <div className="space-y-1 text-center">
          <p className="text-sm font-medium text-foreground">{props.heading}</p>
          <p className="text-xs text-muted-foreground">{props.description}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={commandFieldId}>Command</Label>
          <Input
            id={commandFieldId}
            autoFocus
            placeholder="bun run dev"
            value={command}
            onChange={(event) => setCommand(event.target.value)}
          />
          {suggestions.length > 0 ? (
            <div className="space-y-1 pt-0.5">
              <p className="text-[11px] text-muted-foreground">
                {PREVIEW_COMMAND_SUGGESTIONS_HINT}
              </p>
              <div className="flex flex-wrap gap-1">
                {suggestions.map((suggestion) => (
                  <Button
                    key={suggestion.command}
                    type="button"
                    size="chip"
                    shape="capsule"
                    variant="secondary-outline"
                    title={suggestion.command}
                    onClick={() => {
                      setCommand(suggestion.command);
                      setError(null);
                    }}
                  >
                    {suggestion.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={urlTemplateFieldId}>URL template</Label>
          <Input
            id={urlTemplateFieldId}
            placeholder={PREVIEW_URL_TEMPLATE_PLACEHOLDER}
            value={urlTemplate}
            onChange={(event) => setUrlTemplate(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">{PREVIEW_URL_TEMPLATE_HINT}</p>
        </div>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <Button type="submit" size="sm" className="w-full" disabled={submitting}>
          {PREVIEW_SETUP_SUBMIT_LABEL}
        </Button>
      </form>
    </div>
  );
}

export default PreviewSetupForm;
