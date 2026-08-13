import { useCallback, useState } from "react";

import { readPersistedDefaultProvider } from "../appSettings";
import { useComposerDraftStore } from "../composerDraftStore";
import { useHandleNewThread } from "../hooks/useHandleNewThread";
import { readNativeApi } from "../nativeApi";
import { useStore } from "../store";
import { openMeetingInChat } from "./meetingsOpenInChat";
import { resolveNewThreadDefaultModelSelection } from "./meetingsSummaryModel";
import { selectedMeetingSession, type MeetingsWorkspaceSnapshot } from "./meetingsWorkspace";

export function useOpenMeetingInChat() {
  const { handleNewThread, activeProjectId, projects } = useHandleNewThread();
  const [opening, setOpening] = useState(false);

  const openInChat = useCallback(
    async (snapshot: MeetingsWorkspaceSnapshot) => {
      const selected = selectedMeetingSession(snapshot);
      const projectId = activeProjectId ?? projects[0]?.id ?? null;
      const api = readNativeApi();
      if (!selected || !projectId || !api) {
        return null;
      }
      const project =
        useStore.getState().projects.find((item) => item.id === projectId) ?? projects[0] ?? null;
      setOpening(true);
      try {
        return await openMeetingInChat({
          projectId,
          title: selected.title,
          summaryText: snapshot.summary.text,
          transcriptText: snapshot.transcription.text,
          modelSelection: resolveNewThreadDefaultModelSelection({
            projectDefaultModelSelection: project?.defaultModelSelection ?? null,
            defaultProvider: readPersistedDefaultProvider(),
          }),
          handleNewThread: (targetProjectId) => handleNewThread(targetProjectId, { fresh: true }),
          seedComposer: (threadId, prompt) => {
            useComposerDraftStore.getState().setPrompt(threadId, prompt);
          },
          api,
        });
      } finally {
        setOpening(false);
      }
    },
    [activeProjectId, handleNewThread, projects],
  );

  return { openInChat, opening };
}
