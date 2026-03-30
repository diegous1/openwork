import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { ArrowUpRight, Cloud, LogOut, RefreshCcw, Server, Users } from "lucide-solid";

import Button from "./button";
import TextInput from "./text-input";
import {
  clearDenSession,
  DEFAULT_DEN_BASE_URL,
  DenApiError,
  createDenClient,
  normalizeDenBaseUrl,
  readDenSettings,
  resolveDenBaseUrls,
  writeDenSettings,
} from "../lib/den";
import { isDesktopDeployment } from "../lib/openwork-deployment";
import { usePlatform } from "../context/platform";
import { t } from "../../i18n";

type DenSettingsPanelProps = {
  developerMode: boolean;
  connectRemoteWorkspace: (input: {
    openworkHostUrl?: string | null;
    openworkToken?: string | null;
    directory?: string | null;
    displayName?: string | null;
  }) => Promise<boolean>;
};

function statusBadgeClass(kind: "ready" | "warning" | "neutral" | "error") {
  switch (kind) {
    case "ready":
      return "border-green-7/30 bg-green-3/20 text-green-11";
    case "warning":
      return "border-amber-7/30 bg-amber-3/20 text-amber-11";
    case "error":
      return "border-red-7/30 bg-red-3/20 text-red-11";
    default:
      return "border-gray-6/60 bg-gray-3/20 text-gray-11";
  }
}

function workerStatusMeta(status: string) {
  const normalized = status.trim().toLowerCase();
  switch (normalized) {
    case "healthy":
      return { label: t("den.status_ready"), tone: "ready" as const, canOpen: true };
    case "provisioning":
      return { label: t("den.status_provisioning"), tone: "warning" as const, canOpen: false };
    case "failed":
      return { label: t("den.status_failed"), tone: "error" as const, canOpen: false };
    case "stopped":
      return { label: t("den.status_stopped"), tone: "neutral" as const, canOpen: false };
    default:
      return {
        label: normalized
          ? `${normalized.slice(0, 1).toUpperCase()}${normalized.slice(1)}`
          : t("den.status_unknown"),
        tone: "neutral" as const,
        canOpen: normalized === "ready",
      };
  }
}

export default function DenSettingsPanel(props: DenSettingsPanelProps) {
  const platform = usePlatform();
  const initial = readDenSettings();
  const initialBaseUrl = props.developerMode
    ? initial.baseUrl || DEFAULT_DEN_BASE_URL
    : DEFAULT_DEN_BASE_URL;

  const [baseUrl, setBaseUrl] = createSignal(initialBaseUrl);
  const [baseUrlDraft, setBaseUrlDraft] = createSignal(initialBaseUrl);
  const [baseUrlError, setBaseUrlError] = createSignal<string | null>(null);
  const [authToken, setAuthToken] = createSignal(initial.authToken?.trim() || "");
  const [activeOrgId, setActiveOrgId] = createSignal(initial.activeOrgId?.trim() || "");
  const [authBusy, setAuthBusy] = createSignal(false);
  const [sessionBusy, setSessionBusy] = createSignal(false);
  const [orgsBusy, setOrgsBusy] = createSignal(false);
  const [workersBusy, setWorkersBusy] = createSignal(false);
  const [openingWorkerId, setOpeningWorkerId] = createSignal<string | null>(null);
  const [user, setUser] = createSignal<{
    id: string;
    email: string;
    name: string | null;
  } | null>(null);
  const [orgs, setOrgs] = createSignal<
    Array<{ id: string; name: string; slug: string; role: "owner" | "member" }>
  >([]);
  const [workers, setWorkers] = createSignal<
    Array<{
      workerId: string;
      workerName: string;
      status: string;
      instanceUrl: string | null;
      provider: string | null;
      isMine: boolean;
      createdAt: string | null;
    }>
  >([]);
  const [statusMessage, setStatusMessage] = createSignal<string | null>(null);
  const [authError, setAuthError] = createSignal<string | null>(null);
  const [orgsError, setOrgsError] = createSignal<string | null>(null);
  const [workersError, setWorkersError] = createSignal<string | null>(null);

  const activeOrg = createMemo(() => orgs().find((org) => org.id === activeOrgId()) ?? null);
  const client = createMemo(() =>
    createDenClient({ baseUrl: baseUrl(), token: authToken() }),
  );
  const isSignedIn = createMemo(() => Boolean(user() && authToken().trim()));

  const summaryTone = createMemo(() => {
    if (authError() || workersError() || orgsError()) return "error" as const;
    if (sessionBusy() || orgsBusy() || workersBusy()) return "warning" as const;
    if (isSignedIn()) return "ready" as const;
    return "neutral" as const;
  });

  const summaryLabel = createMemo(() => {
    if (authError()) return t("den.summary_needs_attention");
    if (sessionBusy()) return t("den.summary_checking");
    if (isSignedIn()) return t("den.summary_connected");
    return t("den.summary_signed_out");
  });

  createEffect(() => {
    writeDenSettings({
      baseUrl: props.developerMode ? baseUrl() : DEFAULT_DEN_BASE_URL,
      authToken: authToken() || null,
      activeOrgId: activeOrgId() || null,
    });
  });

  createEffect(() => {
    if (!props.developerMode) {
      setBaseUrl(DEFAULT_DEN_BASE_URL);
      setBaseUrlDraft(DEFAULT_DEN_BASE_URL);
      setBaseUrlError(null);
    }
  });

  const openControlPlane = () => {
    platform.openLink(resolveDenBaseUrls(baseUrl()).baseUrl);
  };

  const openBrowserAuth = (mode: "sign-in" | "sign-up") => {
    const target = new URL(resolveDenBaseUrls(baseUrl()).baseUrl);
    target.searchParams.set("mode", mode);
    if (isDesktopDeployment()) {
      target.searchParams.set("desktopAuth", "1");
      target.searchParams.set("desktopScheme", "openwork");
    }
    platform.openLink(target.toString());
    setStatusMessage(
      mode === "sign-up"
        ? t("den.finish_creation")
        : t("den.finish_sign_in"),
    );
    setAuthError(null);
  };

  const clearSessionState = () => {
    setUser(null);
    setOrgs([]);
    setWorkers([]);
    setActiveOrgId("");
    setOrgsError(null);
    setWorkersError(null);
  };

  const clearSignedInState = (message?: string | null) => {
    clearDenSession({ includeBaseUrls: !props.developerMode });
    if (!props.developerMode) {
      setBaseUrl(DEFAULT_DEN_BASE_URL);
      setBaseUrlDraft(DEFAULT_DEN_BASE_URL);
    }
    setAuthToken("");
    setOpeningWorkerId(null);
    clearSessionState();
    setBaseUrlError(null);
    setAuthError(null);
    setStatusMessage(message ?? null);
  };

  const applyBaseUrl = () => {
    const normalized = normalizeDenBaseUrl(baseUrlDraft());
    if (!normalized) {
      setBaseUrlError(t("den.invalid_url"));
      return;
    }

    const resolved = resolveDenBaseUrls(normalized);
    setBaseUrlError(null);
    if (resolved.baseUrl === baseUrl()) {
      setBaseUrlDraft(resolved.baseUrl);
      return;
    }

    setBaseUrl(resolved.baseUrl);
    setBaseUrlDraft(resolved.baseUrl);
    clearSignedInState(t("den.url_updated"));
  };

  const refreshOrgs = async (quiet = false) => {
    if (!authToken().trim()) {
      setOrgs([]);
      setActiveOrgId("");
      return;
    }

    setOrgsBusy(true);
    if (!quiet) setOrgsError(null);

    try {
      const response = await client().listOrgs();
      setOrgs(response.orgs);
      const current = activeOrgId().trim();
      const fallback = response.defaultOrgId ?? response.orgs[0]?.id ?? "";
      const next = response.orgs.some((org) => org.id === current) ? current : fallback;
      setActiveOrgId(next);
      if (!quiet && response.orgs.length > 0) {
        setStatusMessage(
          t("den.loaded_orgs").replace("{count}", String(response.orgs.length)),
        );
      }
    } catch (error) {
      setOrgsError(error instanceof Error ? error.message : t("den.failed_load_orgs"));
    } finally {
      setOrgsBusy(false);
    }
  };

  const refreshWorkers = async (quiet = false) => {
    const orgId = activeOrgId().trim();
    if (!authToken().trim() || !orgId) {
      setWorkers([]);
      return;
    }

    setWorkersBusy(true);
    if (!quiet) setWorkersError(null);

    try {
      const nextWorkers = await client().listWorkers(orgId, 20);
      setWorkers(nextWorkers);
      if (!quiet) {
        const orgName = activeOrg()?.name ?? "this org";
        setStatusMessage(
          nextWorkers.length > 0
            ? t("den.loaded_workers").replace("{count}", String(nextWorkers.length)).replace("{org}", orgName)
            : t("den.no_workers_found").replace("{org}", orgName),
        );
      }
    } catch (error) {
      setWorkersError(error instanceof Error ? error.message : t("den.failed_load_workers"));
    } finally {
      setWorkersBusy(false);
    }
  };

  createEffect(() => {
    const token = authToken().trim();
    const currentBaseUrl = baseUrl();
    let cancelled = false;

    if (!token) {
      setSessionBusy(false);
      clearSessionState();
      setAuthError(null);
      return;
    }

    setSessionBusy(true);
    setAuthError(null);

    void createDenClient({ baseUrl: currentBaseUrl, token })
      .getSession()
      .then((nextUser) => {
        if (cancelled) return;
        setUser(nextUser);
        setStatusMessage(t("den.signed_in_as").replace("{email}", nextUser.email));
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof DenApiError && error.status === 401) {
          clearSignedInState();
        } else {
          clearSessionState();
        }
        setAuthError(
          error instanceof Error ? error.message : t("den.no_session"),
        );
      })
      .finally(() => {
        if (!cancelled) setSessionBusy(false);
      });

    return () => {
      cancelled = true;
    };
  });

  createEffect(() => {
    if (!user()) return;
    void refreshOrgs(true);
  });

  createEffect(() => {
    if (!user() || !activeOrgId().trim()) return;
    void refreshWorkers(true);
  });

  createEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{
        status?: string;
        email?: string | null;
        message?: string | null;
      }>;
      const nextSettings = readDenSettings();
      setBaseUrl(nextSettings.baseUrl || DEFAULT_DEN_BASE_URL);
      setBaseUrlDraft(nextSettings.baseUrl || DEFAULT_DEN_BASE_URL);
      setAuthToken(nextSettings.authToken?.trim() || "");
      setActiveOrgId(nextSettings.activeOrgId?.trim() || "");
      if (customEvent.detail?.status === "success") {
        setAuthError(null);
        setStatusMessage(
          customEvent.detail.email?.trim()
            ? t("den.connected_as").replace("{email}", customEvent.detail.email.trim())
            : t("den.connected"),
        );
      } else if (customEvent.detail?.status === "error") {
        setAuthError(
          customEvent.detail.message?.trim() ||
            t("den.sign_in_failed"),
        );
      }
    };

    window.addEventListener(
      "openwork-den-session-updated",
      handler as EventListener,
    );
    return () =>
      window.removeEventListener(
        "openwork-den-session-updated",
        handler as EventListener,
      );
  });

  const signOut = async () => {
    if (authBusy()) return;

    setAuthBusy(true);
    try {
      if (authToken().trim()) {
        await client().signOut();
      }
    } catch {
      // ignore remote sign out failures
    } finally {
      setAuthBusy(false);
    }

    clearSignedInState(t("den.signed_out_msg"));
  };

  const handleOpenWorker = async (workerId: string, workerName: string) => {
    const orgId = activeOrgId().trim();
    if (!orgId) {
      setWorkersError(t("den.choose_org"));
      return;
    }

    setOpeningWorkerId(workerId);
    setWorkersError(null);

    try {
      const tokens = await client().getWorkerTokens(workerId, orgId);
      const openworkUrl = tokens.openworkUrl?.trim() ?? "";
      const accessToken =
        tokens.ownerToken?.trim() || tokens.clientToken?.trim() || "";
      if (!openworkUrl || !accessToken) {
        throw new Error(t("den.worker_not_ready"));
      }

      const ok = await props.connectRemoteWorkspace({
        openworkHostUrl: openworkUrl,
        openworkToken: accessToken,
        directory: null,
        displayName: workerName,
      });
      if (!ok) {
        throw new Error(t("den.failed_open_worker").replace("{name}", workerName));
      }

      setStatusMessage(t("den.opened_worker").replace("{name}", workerName));
    } catch (error) {
      setWorkersError(
        error instanceof Error ? error.message : t("den.failed_open").replace("{name}", workerName),
      );
    } finally {
      setOpeningWorkerId(null);
    }
  };

  const settingsPanelClass =
    "rounded-[28px] border border-dls-border bg-dls-surface p-5 md:p-6";
  const settingsPanelSoftClass =
    "rounded-2xl border border-gray-6/60 bg-gray-1/40 p-4";
  const headerBadgeClass =
    "inline-flex min-h-8 items-center gap-2 rounded-xl border border-gray-6/60 bg-gray-1/40 px-3 text-[13px] font-medium text-dls-text";
  const headerStatusBadgeClass =
    "inline-flex h-8 items-center justify-center gap-2 rounded-xl border border-gray-6/60 bg-gray-1/40 px-3 text-[13px] leading-none font-medium text-dls-secondary";

  return (
    <div class="space-y-6">
      <div class={`${settingsPanelClass} space-y-4`}>
        <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div class="space-y-2">
            <div class={headerBadgeClass}>
              <Cloud size={13} class="text-dls-secondary" />
              {t("den.title")}
            </div>
            <div>
              <div class="text-sm font-medium text-dls-text">
                {t("den.description")}
              </div>
              <div class="mt-1 max-w-[60ch] text-xs text-dls-secondary">
                {t("den.tagline")}
              </div>
            </div>
          </div>
          <div class={headerStatusBadgeClass}>
            <span
              class={`h-2 w-2 rounded-full ${summaryTone() === "ready" ? "bg-green-500" : summaryTone() === "warning" ? "bg-amber-500" : summaryTone() === "error" ? "bg-red-500" : "bg-gray-400"}`}
            />
            {summaryLabel()}
          </div>
        </div>

        <Show when={props.developerMode}>
          <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <TextInput
              label={t("den.control_plane_url_label")}
              value={baseUrlDraft()}
              onInput={(event) => setBaseUrlDraft(event.currentTarget.value)}
              placeholder={DEFAULT_DEN_BASE_URL}
              hint={t("den.control_plane_url_hint")}
              disabled={authBusy() || sessionBusy()}
            />
            <div class="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                class="h-9 px-3 text-xs"
                onClick={() => setBaseUrlDraft(baseUrl())}
                disabled={authBusy() || sessionBusy()}
              >
                {t("den.reset")}
              </Button>
              <Button
                variant="secondary"
                class="h-9 px-3 text-xs"
                onClick={applyBaseUrl}
                disabled={authBusy() || sessionBusy()}
              >
                {t("den.save_url")}
              </Button>
              <Button
                variant="outline"
                class="h-9 px-3 text-xs"
                onClick={openControlPlane}
              >
                {t("den.open_in_browser")}
                <ArrowUpRight size={13} />
              </Button>
            </div>
          </div>
        </Show>

        <Show when={baseUrlError()}>
          {(value) => (
            <div class="rounded-xl border border-red-7/30 bg-red-1/40 px-3 py-2 text-xs text-red-11">
              {value()}
            </div>
          )}
        </Show>

        <Show when={statusMessage() && !authError() && !workersError() && !orgsError()}>
          {(value) => (
            <div class="rounded-xl border border-gray-6/60 bg-gray-1/60 px-3 py-2 text-xs text-gray-11">
              {value()}
            </div>
          )}
        </Show>
      </div>

      <Show when={!isSignedIn()}>
        <div class={`${settingsPanelClass} space-y-4`}>
          <div class="space-y-2">
            <div class="text-sm font-medium text-dls-text">
              {t("den.sign_in_title")}
            </div>
            <div class="max-w-[54ch] text-sm text-dls-secondary">
              {t("den.tagline")}
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => openBrowserAuth("sign-in")}>
              {t("den.sign_in")}
              <ArrowUpRight size={13} />
            </Button>
            <Button
              variant="outline"
              class="text-xs h-9 px-3"
              onClick={() => openBrowserAuth("sign-up")}
            >
              {t("den.create_account")}
              <ArrowUpRight size={13} />
            </Button>
          </div>

          <Show when={authError()}>
            {(value) => (
              <div class="rounded-xl border border-red-7/30 bg-red-1/40 px-3 py-2 text-xs text-red-11">
                {value()}
              </div>
            )}
          </Show>

          <div class={`${settingsPanelSoftClass} text-sm text-gray-10`}>
            {t("den.finish_auth")}
          </div>
        </div>
      </Show>

      <Show when={isSignedIn()}>
        <div class="space-y-6">
          <div class={`${settingsPanelClass} space-y-4`}>
            <div>
              <div class="text-sm font-medium text-dls-text">{t("den.account_title")}</div>
              <div class="mt-1 text-xs text-dls-secondary">
                {t("den.account_description")}
              </div>
            </div>

            <div class="flex flex-col gap-3">
              <div class="flex flex-col gap-3 rounded-xl border border-gray-6/60 bg-gray-1/40 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div class="min-w-0">
                  <div class="truncate text-sm font-medium text-dls-text">
                    {user()?.name || user()?.email}
                  </div>
                  <div class="truncate text-xs text-dls-secondary">
                    {user()?.email}
                  </div>
                </div>
                <Button
                  variant="outline"
                  class="h-8 px-3 text-xs shrink-0"
                  onClick={() => void signOut()}
                  disabled={authBusy() || sessionBusy()}
                >
                  <LogOut size={13} class="mr-1.5" />
                  {authBusy() ? t("den.signing_out") : t("den.sign_out")}
                </Button>
              </div>

              <div class="flex flex-col gap-3 rounded-xl border border-gray-6/60 bg-gray-1/40 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div class="min-w-0">
                  <div class="text-sm font-medium text-dls-text">{t("den.active_org")}</div>
                  <div class="truncate text-xs text-dls-secondary">
                    {t("den.workers_scoped")}
                  </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <select
                    class="max-w-[220px] rounded-lg border border-dls-border bg-dls-surface px-3 py-1.5 text-xs text-dls-text shadow-sm focus:outline-none focus:ring-2 focus:ring-[rgba(var(--dls-accent-rgb),0.2)]"
                    value={activeOrgId()}
                    onChange={(event) => {
                      setActiveOrgId(event.currentTarget.value);
                      setStatusMessage(
                        t("den.switched_org").replace("{org}", activeOrg()?.name ?? "the selected org"),
                      );
                    }}
                    disabled={orgsBusy() || orgs().length === 0}
                  >
                    <For each={orgs()}>
                      {(org) => (
                        <option value={org.id}>
                          {org.name} {org.role === "owner" ? t("den.owner_suffix") : t("den.member_suffix")}
                        </option>
                      )}
                    </For>
                  </select>
                  <Button
                    variant="outline"
                    class="h-8 px-3 text-xs"
                    onClick={() => void refreshOrgs()}
                    disabled={orgsBusy()}
                  >
                    <RefreshCcw size={13} class={orgsBusy() ? "animate-spin" : ""} />
                  </Button>
                </div>
              </div>
            </div>

            <Show when={orgsError()}>
              {(value) => (
                <div class="rounded-xl border border-red-7/30 bg-red-1/40 px-3 py-2 text-xs text-red-11">
                  {value()}
                </div>
              )}
            </Show>
          </div>

          <div class={`${settingsPanelClass} space-y-4`}>
            <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div class="flex items-center gap-2 text-sm font-medium text-dls-text">
                  <Server size={15} class="text-dls-secondary" />
                  {t("den.workers_title")}
                </div>
                <div class="mt-1 text-xs text-dls-secondary">
                  {t("den.workers_description")}
                </div>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <div class="inline-flex items-center gap-1.5 rounded-full border border-gray-6/60 bg-gray-1/40 px-2.5 py-1 text-[11px] font-medium text-gray-11">
                  <Users size={12} />
                  {activeOrg()?.name || t("den.no_org_selected")}
                </div>
                <Button
                  variant="outline"
                  class="h-8 px-3 text-xs"
                  onClick={() => void refreshWorkers()}
                  disabled={workersBusy() || !activeOrgId().trim()}
                >
                  <RefreshCcw size={13} class={workersBusy() ? "animate-spin" : ""} />
                  {t("den.refresh")}
                </Button>
              </div>
            </div>

            <Show when={workersError()}>
              {(value) => (
                <div class="rounded-xl border border-red-7/30 bg-red-1/40 px-3 py-2 text-xs text-red-11">
                  {value()}
                </div>
              )}
            </Show>

            <Show when={!workersBusy() && workers().length === 0}>
              <div class={`${settingsPanelSoftClass} border-dashed py-6 text-center text-sm text-dls-secondary`}>
                {t("den.no_workers_visible")}
              </div>
            </Show>

            <div class="space-y-1">
              <For each={workers()}>
                {(worker) => {
                  const status = createMemo(() => workerStatusMeta(worker.status));
                  return (
                    <div class="flex items-center justify-between rounded-xl px-3 py-2 text-left text-[13px] transition-colors hover:bg-gray-2/60">
                      <div class="min-w-0 pr-4">
                        <div class="flex flex-wrap items-center gap-2">
                          <span class="truncate font-medium text-dls-text">
                            {worker.workerName}
                          </span>
                          <span
                            class={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusBadgeClass(status().tone)}`}
                          >
                            {status().label}
                          </span>
                          <Show when={worker.isMine}>
                            <span class="inline-flex items-center rounded-full border border-gray-6/60 bg-gray-1/40 px-2 py-0.5 text-[10px] font-medium text-gray-11">
                              {t("den.mine_badge")}
                            </span>
                          </Show>
                        </div>
                        <div class="mt-0.5 truncate text-[11px] text-dls-secondary">
                          {worker.provider ? t("den.worker_type").replace("{provider}", worker.provider) : t("den.cloud_worker")}
                          <Show when={worker.instanceUrl}>
                            {(value) => <span> · {value()}</span>}
                          </Show>
                        </div>
                      </div>
                      <Button
                        variant="secondary"
                        class="h-8 px-4 text-xs shrink-0"
                        onClick={() =>
                          void handleOpenWorker(worker.workerId, worker.workerName)
                        }
                        disabled={openingWorkerId() !== null || !status().canOpen}
                        title={!status().canOpen ? t("den.worker_not_ready_tooltip") : undefined}
                      >
                        {openingWorkerId() === worker.workerId ? t("den.opening") : t("den.open")}
                      </Button>
                    </div>
                  );
                }}
              </For>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
