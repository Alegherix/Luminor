// FILE: ComposerHandoffPicker.tsx
// Purpose: Composer-footer menu for handing the current thread off to another provider.
// Layer: Chat composer presentation
// Depends on: shared picker chrome, provider icons, and the thread-handoff create callback.

import { PROVIDER_DISPLAY_NAMES, type ProviderKind } from "@luminor/contracts";
import { ChevronDownIcon, HandoffIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";
import { ProviderIcon } from "../ProviderIcon";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuTrigger } from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ComposerPickerMenuPopup } from "./ComposerPickerMenuPopup";
import { COMPOSER_PICKER_TRIGGER_TEXT_CLASS_NAME } from "./composerPickerStyles";

type ComposerHandoffPickerProps = {
  targetProviders: ReadonlyArray<ProviderKind>;
  disabled: boolean;
  actionLabel: string;
  hideLabel?: boolean;
  onCreateHandoff: (targetProvider: ProviderKind) => void;
};

export function ComposerHandoffPicker(props: ComposerHandoffPickerProps) {
  const hideLabel = props.hideLabel ?? false;
  const isDisabled = props.disabled || props.targetProviders.length === 0;

  const triggerButton = (
    <Button
      size="sm"
      variant="chrome"
      disabled={isDisabled}
      className={cn(
        "min-w-0 shrink-0 justify-start gap-1.5 whitespace-nowrap px-2 sm:px-2.5 [&_svg]:mx-0",
        COMPOSER_PICKER_TRIGGER_TEXT_CLASS_NAME,
      )}
      aria-label={props.actionLabel}
    />
  );

  const triggerContent = (
    <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
      <HandoffIcon aria-hidden="true" className="size-3.5 shrink-0 opacity-80" />
      {hideLabel ? (
        <span className="sr-only">{props.actionLabel}</span>
      ) : (
        <span className="min-w-0 truncate text-[var(--color-text-foreground)]">Hand off</span>
      )}
      <ChevronDownIcon aria-hidden="true" className="ms-0.5 size-3 shrink-0 opacity-60" />
    </span>
  );

  return (
    <Menu>
      <Tooltip>
        <TooltipTrigger render={<MenuTrigger render={triggerButton} />}>
          {triggerContent}
        </TooltipTrigger>
        <TooltipPopup side="top" sideOffset={6} variant="picker">
          {props.actionLabel}
        </TooltipPopup>
      </Tooltip>
      <ComposerPickerMenuPopup align="end" side="top" className="w-48 min-w-48">
        {props.targetProviders.map((provider) => (
          <MenuItem key={provider} onClick={() => props.onCreateHandoff(provider)}>
            <ProviderIcon provider={provider} className="size-3.5 shrink-0 opacity-100" />
            <span>Handoff to {PROVIDER_DISPLAY_NAMES[provider]}</span>
          </MenuItem>
        ))}
      </ComposerPickerMenuPopup>
    </Menu>
  );
}
