import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { useAppSettings } from "~/appSettings";
import {
  buildPullRequestInboxNotificationCopy,
  parsePullRequestInboxNotificationAction,
  pullRequestInboxNotificationAction,
} from "~/components/pullRequest/pullRequestInbox.logic";
import { toastManager } from "~/components/ui/toast";
import { isElectron } from "~/env";
import {
  pullRequestInboxMarkNotifiedMutationOptions,
  pullRequestInboxQueryOptions,
} from "~/lib/pullRequestReactQuery";
import {
  readBrowserNotificationPermissionState,
  requestBrowserNotificationPermission,
} from "./taskCompletion";

function isWindowForeground(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible" && document.hasFocus();
}

export function PullRequestInboxNotifications() {
  const { settings } = useAppSettings();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const inboxQuery = useQuery(pullRequestInboxQueryOptions());
  const markNotified = useMutation(pullRequestInboxMarkNotifiedMutationOptions(queryClient));
  const markNotifiedMutate = markNotified.mutate;
  const seenNotifyKeysRef = useRef(new Set<string>());

  useEffect(() => {
    const onMenuAction = window.desktopBridge?.onMenuAction;
    if (typeof onMenuAction !== "function") return;
    const unsubscribe = onMenuAction((action) => {
      const target = parsePullRequestInboxNotificationAction(action);
      if (!target) return;
      void navigate({
        to: "/pull-requests",
        search: {
          involvement: "all",
          state: "open",
          selectedRepo: target.repository,
          number: target.number,
        },
      });
    });
    return () => {
      unsubscribe?.();
    };
  }, [navigate]);

  useEffect(() => {
    if (!settings.enablePullRequestCommentNotifications) return;
    const pending = (inboxQuery.data?.items ?? []).filter((item) => item.notify && item.comment);
    if (pending.length === 0) return;

    const showToast = settings.enableTaskCompletionToasts;
    const showDesktop = settings.enableSystemTaskCompletionNotifications && !isWindowForeground();

    for (const item of pending) {
      const notifyKey = `${item.repository}#${item.number}:${item.comment?.id ?? ""}`;
      if (seenNotifyKeysRef.current.has(notifyKey)) continue;
      seenNotifyKeysRef.current.add(notifyKey);
      const copy = buildPullRequestInboxNotificationCopy(item);
      const openPullRequest = () => {
        void navigate({
          to: "/pull-requests",
          search: {
            involvement: "all",
            state: "open",
            selectedRepo: item.repository,
            number: item.number,
          },
        });
      };

      if (showToast) {
        toastManager.add({
          type: "warning",
          title: copy.title,
          description: copy.body,
          data: {
            allowCrossThreadVisibility: true,
            compactContextual: true,
            dismissAfterVisibleMs: 8000,
          },
          actionProps: {
            "aria-label": `Open ${copy.title}`,
            children: "Open",
            onClick: openPullRequest,
          },
        });
      }

      if (showDesktop) {
        void (async () => {
          if (window.desktopBridge) {
            await window.desktopBridge.notifications.show({
              title: copy.title,
              body: copy.body,
              silent: false,
              suppressWhenForeground: true,
              action: pullRequestInboxNotificationAction(item),
            });
            return;
          }
          if (!isElectron) {
            if (readBrowserNotificationPermissionState() !== "granted") {
              await requestBrowserNotificationPermission();
            }
            if (readBrowserNotificationPermissionState() === "granted") {
              const notification = new Notification(copy.title, {
                body: copy.body,
                tag: `pull-request-comment:${item.repository}#${item.number}`,
              });
              notification.addEventListener("click", () => {
                window.focus();
                openPullRequest();
              });
            }
          }
        })();
      }

      if (item.comment) {
        markNotifiedMutate({
          repository: item.repository,
          number: item.number,
          commentId: item.comment.id,
        });
      }
    }
  }, [
    inboxQuery.data,
    markNotifiedMutate,
    navigate,
    settings.enablePullRequestCommentNotifications,
    settings.enableSystemTaskCompletionNotifications,
    settings.enableTaskCompletionToasts,
  ]);

  return null;
}
