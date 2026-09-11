import {
  AlertTriangle,
  Download,
  FileUp,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  createCampaign,
  currentCampaignId,
  deleteCampaign,
  downloadCampaignBackup,
  importCampaignBackup,
  listCampaignSlots,
  saveCurrentCampaign,
  subscribeCampaignSlots,
  switchCampaign,
  type CampaignSlot,
} from "../campaigns";
import {
  initializeCampaignHistory,
  redoCampaignChange,
  resetCampaignHistory,
  undoCampaignChange,
} from "../history";
import {
  campaignStorageEstimate,
  getCampaignStorageStatus,
  requestDurableCampaignStorage,
  setCampaignWriteDelay,
  subscribeCampaignStorageStatus,
} from "../persistStorage";
import { requestShortcutsTab } from "../shortcuts";
import { useRAM } from "../store";
import {
  RamButton,
  RamConfirmDialog,
  RamDialog,
  RamField,
  RamIconButton,
  RamInput,
} from "./ui/RamPrimitives";

export const OPEN_CAMPAIGNS_EVENT = "ram:open-campaigns";
export const FOCUS_CONSOLE_EVENT = "ram:focus-console";

function CampaignManager({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [slots, setSlots] = useState<CampaignSlot[]>(() => listCampaignSlots());
  const [name, setName] = useState("New Campaign");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteId, setDeleteId] = useState("");
  const [storageText, setStorageText] = useState("Checking…");
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const refresh = () => setSlots(listCampaignSlots());
    refresh();
    return subscribeCampaignSlots(refresh);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void campaignStorageEstimate().then((estimate) => {
      if (!estimate?.usage || !estimate.quota) {
        setStorageText("Storage estimate unavailable");
        return;
      }
      const mb = (value: number) => `${(value / 1024 / 1024).toFixed(1)} MB`;
      setStorageText(`${mb(estimate.usage)} used of ${mb(estimate.quota)}`);
    });
  }, [open]);

  async function run(task: () => Promise<void>, success: string) {
    setBusy(true);
    setStatus("");
    try {
      await task();
      resetCampaignHistory();
      setSlots(listCampaignSlots());
      setStatus(success);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <RamDialog open={open} title="Campaigns & backups" onClose={onClose}>
        <div className="campaign-manager">
          <div className="campaign-slot-list">
            {slots.map((slot) => {
              const active = slot.id === currentCampaignId();
              return (
                <button
                  type="button"
                  className={`campaign-slot-row${active ? " is-selected" : ""}`}
                  key={slot.id}
                  disabled={busy || active}
                  onClick={() =>
                    void run(() => switchCampaign(slot.id), `Opened ${slot.name}.`)
                  }
                >
                  <span>{slot.name}</span>
                  <small>
                    {active ? "Current" : new Date(slot.updatedAt).toLocaleString()}
                  </small>
                  {!active && (
                    <RamIconButton
                      label={`Delete ${slot.name}`}
                      variant="danger"
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeleteId(slot.id);
                      }}
                    >
                      <Trash2 size={14} />
                    </RamIconButton>
                  )}
                </button>
              );
            })}
          </div>
          <div className="campaign-create-row">
            <RamField label="New campaign name">
              <RamInput value={name} onChange={(event) => setName(event.target.value)} />
            </RamField>
            <RamButton
              size="sm"
              icon={Plus}
              disabled={busy || !name.trim()}
              onClick={() =>
                void run(async () => {
                  await createCampaign(name.trim());
                }, `Created ${name.trim()}.`)
              }
            >
              Create
            </RamButton>
          </div>
          <div className="campaign-backup-actions">
            <RamButton
              size="sm"
              icon={Save}
              disabled={busy}
              onClick={() => void run(saveCurrentCampaign, "Campaign saved.")}
            >
              Save now
            </RamButton>
            <RamButton size="sm" icon={Download} onClick={downloadCampaignBackup}>
              Export backup
            </RamButton>
            <RamButton size="sm" icon={FileUp} onClick={() => importRef.current?.click()}>
              Import backup
            </RamButton>
            <input
              ref={importRef}
              type="file"
              accept=".json,.ram.json,application/json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void run(
                    () => importCampaignBackup(file),
                    `Imported ${file.name}.`
                  );
                }
                event.target.value = "";
              }}
            />
          </div>
          <p className="settings-note">Browser storage: {storageText}</p>
          {status && <p className="settings-ai-status" aria-live="polite">{status}</p>}
        </div>
      </RamDialog>
      <RamConfirmDialog
        open={Boolean(deleteId)}
        title="Delete campaign?"
        description="This campaign slot and its browser-stored data will be permanently removed."
        confirmLabel="Delete"
        onConfirm={() => {
          const slot = slots.find((entry) => entry.id === deleteId);
          void run(() => deleteCampaign(deleteId), `${slot?.name ?? "Campaign"} deleted.`);
          setDeleteId("");
        }}
        onClose={() => setDeleteId("")}
      />
    </>
  );
}

export function QoLHost() {
  const [campaignsOpen, setCampaignsOpen] = useState(false);
  const [otherTab, setOtherTab] = useState(false);
  const ui = useRAM((state) => state.uiSettings);
  const status = useSyncExternalStore(
    subscribeCampaignStorageStatus,
    getCampaignStorageStatus,
    getCampaignStorageStatus
  );

  useEffect(() => initializeCampaignHistory(), []);

  useEffect(() => {
    setCampaignWriteDelay(ui.autosaveEveryMs);
  }, [ui.autosaveEveryMs]);

  useEffect(() => {
    if (localStorage.getItem("ram-storage-persist-asked")) return;
    localStorage.setItem("ram-storage-persist-asked", "1");
    void requestDurableCampaignStorage();
  }, []);

  useEffect(() => {
    const openCampaigns = () => setCampaignsOpen(true);
    window.addEventListener(OPEN_CAMPAIGNS_EVENT, openCampaigns);
    return () => {
      window.removeEventListener(OPEN_CAMPAIGNS_EVENT, openCampaigns);
    };
  }, []);

  useEffect(() => {
    const channel = typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel("ram-campaign-sync")
      : null;
    const tabId = crypto.randomUUID();
    channel?.postMessage({ type: "open", tabId, campaignId: currentCampaignId() });
    channel?.addEventListener("message", (event) => {
      if (
        event.data?.tabId !== tabId &&
        event.data?.campaignId === currentCampaignId()
      ) {
        setOtherTab(true);
        if (event.data?.type === "open") {
          channel.postMessage({
            type: "present",
            tabId,
            campaignId: currentCampaignId(),
          });
        }
      }
    });
    return () => channel?.close();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redoCampaignChange();
        else undoCampaignChange();
      } else if (mod && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redoCampaignChange();
      } else if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        window.dispatchEvent(new Event(FOCUS_CONSOLE_EVENT));
      } else if (mod && event.key.toLowerCase() === "l") {
        event.preventDefault();
        useRAM.getState().setTokenManagerOpen(true);
      } else if (mod && event.key === ",") {
        event.preventDefault();
        useRAM.getState().setSettingsOpen(true);
      } else if (!typing && event.key === "?") {
        event.preventDefault();
        requestShortcutsTab();
        useRAM.getState().setSettingsOpen(true);
      } else if (!typing && !mod && event.key.toLowerCase() === "n") {
        if (!useRAM.getState().combat) return;
        event.preventDefault();
        useRAM.getState().nextTurn();
      } else if (event.key === "Escape") {
        setCampaignsOpen(false);
        useRAM.getState().setSettingsOpen(false);
        useRAM.getState().setTokenManagerOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {(status.state === "error" || otherTab) && (
        <div className="storage-warning" role="alert">
          <AlertTriangle size={15} />
          <span>
            {status.state === "error"
              ? status.message
              : "This campaign is open in another tab. Changes may overwrite each other."}
          </span>
          {otherTab && (
            <button type="button" onClick={() => setOtherTab(false)}>Dismiss</button>
          )}
        </div>
      )}
      <CampaignManager open={campaignsOpen} onClose={() => setCampaignsOpen(false)} />
    </>
  );
}
