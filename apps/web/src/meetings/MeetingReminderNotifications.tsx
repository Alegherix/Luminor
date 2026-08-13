import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { toastManager } from "~/components/ui/toast";
import { isElectron } from "~/env";

import { isGoogleMeetJoinUrl } from "./meetUrl";
import {
  MEETING_REMINDER_TICK_MS,
  meetingReminderFiredKey,
  type MeetingReminder,
} from "./meetingsWorkspace";
import { useMeetingsWorkspace } from "./useMeetingsWorkspace";

export function meetingReminderToastCopy(reminder: MeetingReminder): {
  title: string;
  description?: string;
} {
  if (reminder.kind === "meeting.starting") {
    return { title: `Starting soon: ${reminder.title}` };
  }
  return {
    title: `Join available: ${reminder.title}`,
    ...(reminder.meetUrl ? { description: reminder.meetUrl } : {}),
  };
}

export function MeetingReminderNotifications() {
  if (!isElectron) {
    return null;
  }
  return <DesktopMeetingReminderNotifications />;
}

function DesktopMeetingReminderNotifications() {
  const navigate = useNavigate();
  const { snapshot, tick, acknowledgeReminder, joinFromReminder } = useMeetingsWorkspace();
  const surfacedKeysRef = useRef(new Set<string>());

  useEffect(() => {
    tick();
    const intervalId = window.setInterval(() => {
      tick();
    }, MEETING_REMINDER_TICK_MS);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [tick]);

  useEffect(() => {
    for (const reminder of snapshot.dueReminders) {
      const key = meetingReminderFiredKey(reminder);
      if (surfacedKeysRef.current.has(key)) {
        continue;
      }
      surfacedKeysRef.current.add(key);
      acknowledgeReminder(reminder);
      const copy = meetingReminderToastCopy(reminder);
      const activate = () => {
        void navigate({ to: "/meetings" });
        void joinFromReminder(reminder);
      };
      toastManager.add({
        type: reminder.kind === "meeting.starting" ? "warning" : "info",
        title: copy.title,
        description: copy.description,
        data: {
          allowCrossThreadVisibility: true,
          compactContextual: true,
          dismissAfterVisibleMs: 8000,
          onActivate: activate,
        },
        actionProps: {
          "aria-label":
            reminder.meetUrl && isGoogleMeetJoinUrl(reminder.meetUrl)
              ? `Join ${reminder.title}`
              : `Open ${reminder.title}`,
          children: reminder.meetUrl && isGoogleMeetJoinUrl(reminder.meetUrl) ? "Join" : "Open",
          onClick: activate,
        },
      });
    }
  }, [acknowledgeReminder, joinFromReminder, navigate, snapshot.dueReminders]);

  return null;
}
