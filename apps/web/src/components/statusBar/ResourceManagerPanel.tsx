import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ResourceProcessLeaf, ResourceProcessTreeGroup } from "@luminor/contracts";
import {
  formatResourceCpu,
  formatResourceRss,
  resourceProcessTone,
} from "@luminor/shared/resourceProcesses";

import { ChevronRightIcon, RefreshCwIcon, TerminalIcon, TrashCanIcon } from "~/lib/icons";
import {
  DISCLOSURE_INNER_CLASS,
  disclosureChevronClassName,
  disclosureShellClassName,
} from "~/lib/disclosureMotion";
import {
  serverResourceProcessesQueryOptions,
  serverStopResourceLeftoversMutationOptions,
  serverStopResourceProcessMutationOptions,
} from "~/lib/serverReactQuery";
import { cn } from "~/lib/utils";

import { ResourceSparkline } from "./ResourceSparkline";

const SPARK_LEN = 24;

export function ResourceManagerPanel({ open }: { open: boolean }) {
  const queryClient = useQueryClient();
  const query = useQuery(
    serverResourceProcessesQueryOptions({
      enabled: open,
      refetchInterval: open ? 2_000 : false,
    }),
  );
  const stopMutation = useMutation(serverStopResourceProcessMutationOptions({ queryClient }));
  const leftoversMutation = useMutation(serverStopResourceLeftoversMutationOptions({ queryClient }));
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => new Set(["app", "agents"]));
  const [leftoversOpen, setLeftoversOpen] = useState(true);
  const [samples, setSamples] = useState<ReadonlyMap<string, readonly number[]>>(() => new Map());

  const snapshot = query.data;
  const leftovers = snapshot?.groups.find((group) => group.group === "leftovers");
  const liveGroups = snapshot?.groups.filter((group) => group.group !== "leftovers") ?? [];

  useEffect(() => {
    if (!snapshot) return;
    setSamples((current) => {
      const next = new Map(current);
      for (const group of snapshot.groups) {
        next.set(group.id, appendSample(next.get(group.id), group.cpu));
        for (const leaf of group.children) {
          next.set(leaf.id, appendSample(next.get(leaf.id), leaf.cpu));
        }
      }
      return next;
    });
  }, [snapshot]);

  const totals = useMemo(
    () => ({
      cpuLabel: formatResourceCpu(snapshot?.totalCpu ?? 0),
      rssLabel: formatResourceRss(snapshot?.totalRssMb ?? 0),
      count: snapshot?.processCount ?? 0,
    }),
    [snapshot],
  );

  const toggleOpen = (id: string) => {
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const requestStop = (leaf: ResourceProcessLeaf) => {
    setConfirmingId(leaf.id);
  };

  const confirmStop = (leaf: ResourceProcessLeaf) => {
    stopMutation.mutate({ pids: [...leaf.pids], fingerprints: [...leaf.fingerprints] });
    setConfirmingId(null);
  };

  if (snapshot && !snapshot.supported) {
    return (
      <div className="px-3 py-3 text-[12px] text-muted-foreground">
        Process listing is not available on this platform.
      </div>
    );
  }

  return (
    <div className="flex h-[min(38rem,70vh)] w-[28rem] flex-col">
      <header className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <TerminalIcon className="size-3.5 text-muted-foreground" />
        <h1 className="flex-1 text-[12px] font-medium">Resource Manager</h1>
        <button
          type="button"
          aria-label="Refresh"
          className="rounded p-0.5 text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground active:scale-[0.97]"
          onClick={() => {
            void query.refetch();
          }}
        >
          <RefreshCwIcon className={cn("size-3.5", query.isFetching && "animate-spin")} />
        </button>
      </header>

      <div className="border-b border-border/50 px-3 py-2 text-[12px] font-medium tabular-nums">
        {totals.cpuLabel}
        <span className="mx-1.5 text-muted-foreground">·</span>
        {totals.rssLabel} Σ RSS
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_48px_40px_52px_18px] gap-1 px-3 pt-2 pb-1 text-[10px] text-muted-foreground">
        <span>Name</span>
        <span />
        <span className="text-right">CPU</span>
        <span className="text-right">RSS</span>
        <span />
      </div>

      <div
        className="grid min-h-0 flex-1"
        style={{
          gridTemplateRows:
            leftovers && leftoversOpen ? "minmax(0, 7fr) minmax(0, 13fr)" : "minmax(0, 1fr) auto",
        }}
      >
        <div className="min-h-0 overflow-y-auto px-1 pb-1">
          {liveGroups.map((group) => (
            <TreeGroup
              key={group.id}
              group={group}
              samples={samples}
              open={openIds.has(group.id)}
              confirmingId={confirmingId}
              onToggle={() => toggleOpen(group.id)}
              onRequestStop={requestStop}
              onCancel={() => setConfirmingId(null)}
              onConfirm={confirmStop}
            />
          ))}
        </div>

        {leftovers ? (
          <div className="flex min-h-0 flex-col border-t border-border/60">
            <button
              type="button"
              className="flex w-full shrink-0 items-center gap-2 px-3 py-2 text-left text-[12px] transition-colors duration-150 ease-out hover:bg-muted/40 active:scale-[0.99]"
              onClick={() => setLeftoversOpen((value) => !value)}
            >
              <span className="flex-1">
                Leftovers ({leftovers.children.length}) · {formatResourceRss(leftovers.rssMb)}
              </span>
              <ChevronRightIcon className={disclosureChevronClassName(leftoversOpen, "size-3")} />
            </button>
            {leftoversOpen ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 overflow-y-auto px-1">
                  {leftovers.children.map((leaf) => (
                    <TreeLeaf
                      key={leaf.id}
                      leaf={leaf}
                      samples={samples.get(leaf.id) ?? []}
                      confirming={confirmingId === leaf.id}
                      onRequestStop={() => requestStop(leaf)}
                      onCancel={() => setConfirmingId(null)}
                      onConfirm={() => confirmStop(leaf)}
                    />
                  ))}
                </div>
                <div className="shrink-0 px-3 py-2">
                  {confirmingId === "leftovers-all" ? (
                    <ConfirmBar
                      name="all leftovers"
                      project="Host"
                      status="dead"
                      detail={`${leftovers.children.length} leftover processes`}
                      onCancel={() => setConfirmingId(null)}
                      onConfirm={() => {
                        leftoversMutation.mutate();
                        setConfirmingId(null);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="flex w-full items-center justify-center gap-1.5 rounded-md bg-destructive/10 px-3 py-1.5 text-[12px] text-destructive transition-[background-color,transform] duration-150 ease-out hover:bg-destructive/15 active:scale-[0.98] disabled:opacity-50"
                      disabled={leftoversMutation.isPending || leftovers.children.length === 0}
                      onClick={() => setConfirmingId("leftovers-all")}
                    >
                      <TrashCanIcon className="size-3.5" />
                      Quit all leftovers
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
            No leftover processes.
          </p>
        )}
      </div>
    </div>
  );
}

function TreeGroup({
  group,
  samples,
  open,
  confirmingId,
  onToggle,
  onRequestStop,
  onCancel,
  onConfirm,
}: {
  group: ResourceProcessTreeGroup;
  samples: ReadonlyMap<string, readonly number[]>;
  open: boolean;
  confirmingId: string | null;
  onToggle: () => void;
  onRequestStop: (leaf: ResourceProcessLeaf) => void;
  onCancel: () => void;
  onConfirm: (leaf: ResourceProcessLeaf) => void;
}) {
  const tone = resourceProcessTone(group.status, group.rssMb, group.cpu);
  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_48px_40px_52px_18px] items-center gap-1 rounded-md px-2 py-1 text-[12px] hover:bg-muted/40">
        <button type="button" className="flex min-w-0 items-start gap-1 text-left" onClick={onToggle}>
          <ChevronRightIcon className={disclosureChevronClassName(open, "mt-0.5 size-3")} />
          <span className="min-w-0">
            <span className="block truncate">{group.name}</span>
            <span className="block truncate text-[10px] text-muted-foreground">{group.project}</span>
          </span>
        </button>
        <ResourceSparkline values={samples.get(group.id) ?? []} tone={tone} />
        <span className="text-right tabular-nums text-muted-foreground">{formatResourceCpu(group.cpu)}</span>
        <span className="text-right tabular-nums">{formatResourceRss(group.rssMb)}</span>
        <span />
      </div>
      <div className={disclosureShellClassName(open)}>
        <div className={DISCLOSURE_INNER_CLASS}>
          {group.children.map((leaf) => (
            <TreeLeaf
              key={leaf.id}
              leaf={leaf}
              samples={samples.get(leaf.id) ?? []}
              confirming={confirmingId === leaf.id}
              onRequestStop={() => onRequestStop(leaf)}
              onCancel={onCancel}
              onConfirm={() => onConfirm(leaf)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function TreeLeaf({
  leaf,
  samples,
  confirming,
  onRequestStop,
  onCancel,
  onConfirm,
}: {
  leaf: ResourceProcessLeaf;
  samples: readonly number[];
  confirming: boolean;
  onRequestStop: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const tone = resourceProcessTone(leaf.status, leaf.rssMb, leaf.cpu);
  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_48px_40px_52px_18px] items-center gap-1 rounded-md px-2 py-1 text-[12px] hover:bg-muted/40">
        <div className="flex min-w-0 items-start gap-1 pl-3">
          <span
            className={cn(
              "mx-1 mt-1.5 size-1.5 shrink-0 rounded-full",
              leaf.status === "running" && "bg-success",
              leaf.status === "idle" && "bg-muted-foreground/50",
              leaf.status === "stale" && "bg-warning",
              leaf.status === "dead" && "bg-destructive",
            )}
          />
          <span className="min-w-0">
            <span className="block truncate">{leaf.name}</span>
            <span className="block truncate text-[10px] text-muted-foreground">{leaf.project}</span>
          </span>
        </div>
        <ResourceSparkline values={samples} tone={tone} />
        <span className="text-right tabular-nums text-muted-foreground">{formatResourceCpu(leaf.cpu)}</span>
        <span className="text-right tabular-nums">{formatResourceRss(leaf.rssMb)}</span>
        {leaf.canStop ? (
          <button
            type="button"
            aria-label={`Quit ${leaf.name}`}
            className="rounded p-0.5 text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground active:scale-[0.97]"
            onClick={onRequestStop}
          >
            <TrashCanIcon className="size-3" />
          </button>
        ) : (
          <span />
        )}
      </div>
      {confirming ? (
        <div className="px-2 pb-1 pl-8">
          <ConfirmBar
            name={leaf.name}
            project={leaf.project}
            status={leaf.status}
            detail={leaf.detail}
            onCancel={onCancel}
            onConfirm={onConfirm}
          />
        </div>
      ) : null}
    </div>
  );
}

function ConfirmBar({
  name,
  project,
  status,
  detail,
  onCancel,
  onConfirm,
}: {
  name: string;
  project: string;
  status: ResourceProcessLeaf["status"];
  detail: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const label = status === "dead" ? `Force quit ${name}` : status === "stale" ? `Quit ${name}` : `Stop ${name}`;
  return (
    <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-2 py-1 text-[11px]">
      <p className="min-w-0 flex-1 leading-snug text-foreground/90">
        {label}
        <span className="text-muted-foreground">
          {` · ${project}`}
          {status === "dead" ? " · leftover" : status === "stale" ? " · idle, still holding RAM" : ` · ${detail}`}
        </span>
      </p>
      <button
        type="button"
        className="rounded px-1.5 py-0.5 text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground active:scale-[0.97]"
        onClick={onCancel}
      >
        Cancel
      </button>
      <button
        type="button"
        className="rounded bg-destructive px-1.5 py-0.5 text-white transition-transform duration-150 ease-out active:scale-[0.97]"
        onClick={onConfirm}
      >
        Quit
      </button>
    </div>
  );
}

function appendSample(current: readonly number[] | undefined, value: number): number[] {
  const next = [...(current ?? []), value];
  return next.slice(-SPARK_LEN);
}
