import React, { useEffect, useState } from 'react';
import { AlertTriangle, RotateCcw, X } from 'lucide-react';
import { DeleteConfirmModal } from './components/modals/DeleteConfirmModal';
import { ExportModal } from './components/modals/ExportModal';
import { ImportModal } from './components/modals/ImportModal';
import { ModelEditorModal } from './components/modals/ModelEditorModal';
import { RecyclingBinModal } from './components/modals/RecyclingBinModal';
import { SettingsModal, SettingsTab } from './components/modals/SettingsModal';
import { TierManagerModal } from './components/modals/TierManagerModal';
import { TopNav } from './components/TopNav';
import { DataGridView } from './components/views/DataGridView';
import { KanbanView } from './components/views/KanbanView';
import { LiveMonitorView } from './components/views/LiveMonitorView';
import { RapidSorterView } from './components/views/RapidSorterView';
import { AppProvider, useAppStore } from './store/useAppStore';
import { ActiveView, ModelRecord } from './types/models';

const StudioShell: React.FC = () => {
  const {
    data,
    isLoaded,
    toasts,
    dismissToast,
    updateSettings,
    deleteModels,
    bulkUpdateModels,
  } = useAppStore();

  const [activeView, setActiveView] = useState<ActiveView>('live');
  const [importOpen, setImportOpen] = useState(false);
  const [tierManagerOpen, setTierManagerOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general');
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [activeLiveModelId, setActiveLiveModelId] = useState<string | null>(null);
  const [returnViewFromLive, setReturnViewFromLive] = useState<ActiveView | null>(
    null
  );
  const [pendingDeleteModels, setPendingDeleteModels] = useState<ModelRecord[]>([]);

  const editingModel: ModelRecord | null = editingModelId
    ? data.models.find((m) => m.id === editingModelId) ?? null
    : null;

  const hasOpenModal =
    importOpen ||
    tierManagerOpen ||
    exportOpen ||
    trashOpen ||
    settingsOpen ||
    Boolean(editingModel) ||
    pendingDeleteModels.length > 0;

  const openSettings = (tab: SettingsTab = 'general') => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  };

  const openBlendedLiveView = (model: ModelRecord, fromView: ActiveView) => {
    setActiveLiveModelId(model.id);
    setReturnViewFromLive(fromView);
    setActiveView('live');
  };

  const requestDeleteModels = (targets: ModelRecord[]) => {
    if (targets.length === 0) return;
    if (!data.settings.confirmDelete) {
      deleteModels(targets.map((m) => m.id));
      return;
    }
    setPendingDeleteModels(targets);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === '1') {
        e.preventDefault();
        setActiveView('live');
      } else if (key === '2') {
        e.preventDefault();
        setActiveView('sorter');
      } else if (key === '3') {
        e.preventDefault();
        setActiveView('kanban');
      } else if (key === '4') {
        e.preventDefault();
        setActiveView('grid');
      } else if (key === 'i') {
        e.preventDefault();
        setImportOpen(true);
      } else if (key === 'e') {
        e.preventDefault();
        setExportOpen(true);
      } else if (key === 't') {
        e.preventDefault();
        setTierManagerOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!isLoaded) {
    return (
      <div className="h-full flex items-center justify-center bg-canvas text-slate-400 text-xs">
        Loading WatchPulse workspace...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-canvas text-slate-100 overflow-hidden">
      <TopNav
        activeView={activeView}
        onChangeView={(view) => {
          if (view !== 'live') {
            setReturnViewFromLive(null);
          }
          setActiveView(view);
        }}
        onOpenImport={() => setImportOpen(true)}
        onOpenExport={() => setExportOpen(true)}
        onOpenTrash={() => setTrashOpen(true)}
        onOpenSettings={() => openSettings('general')}
      />

      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {activeView === 'sorter' && (
          <RapidSorterView
            hasOpenModal={hasOpenModal}
            onOpenImport={() => setImportOpen(true)}
            onOpenTierManager={() => setTierManagerOpen(true)}
            onOpenDataGrid={() => setActiveView('grid')}
            onSilentPreview={(model) => openBlendedLiveView(model, 'sorter')}
            onRequestDelete={requestDeleteModels}
          />
        )}
        {activeView === 'kanban' && (
          <KanbanView
            onEditModel={(model) => setEditingModelId(model.id)}
            onSilentPreview={(model) => openBlendedLiveView(model, 'kanban')}
            onOpenImport={() => setImportOpen(true)}
            onRequestDelete={requestDeleteModels}
            onJumpToDeckForTier={(tierId) => {
              updateSettings({ deckSourceFilter: tierId });
              setActiveView('sorter');
            }}
          />
        )}
        {activeView === 'grid' && (
          <DataGridView
            onEditModel={(model) => setEditingModelId(model.id)}
            onSilentPreview={(model) => openBlendedLiveView(model, 'grid')}
            onOpenImport={() => setImportOpen(true)}
            onOpenRapidSorter={() => setActiveView('sorter')}
            onRequestDelete={requestDeleteModels}
          />
        )}
        {activeView === 'live' && (
          <LiveMonitorView
            selectedModelId={activeLiveModelId}
            onSelectModel={setActiveLiveModelId}
            onEditModel={(model) => setEditingModelId(model.id)}
            onOpenFeedSettings={() => openSettings('live')}
            onOpenTierManager={() => setTierManagerOpen(true)}
            onOpenImport={() => setImportOpen(true)}
            onJumpToResortDue={() => {
              updateSettings({ deckSourceFilter: '__due__' });
              setActiveView('sorter');
            }}
            returnLabel={
              returnViewFromLive === 'sorter'
                ? 'Back to Rapid Sorter'
                : returnViewFromLive === 'kanban'
                  ? 'Back to Kanban'
                  : returnViewFromLive === 'grid'
                    ? 'Back to Data Grid'
                    : null
            }
            onReturnBack={
              returnViewFromLive
                ? () => {
                    const dest = returnViewFromLive;
                    setReturnViewFromLive(null);
                    setActiveView(dest);
                  }
                : undefined
            }
          />
        )}
      </main>

      {/* Modals */}
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />
      <TierManagerModal
        open={tierManagerOpen}
        onClose={() => setTierManagerOpen(false)}
      />
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} />
      <RecyclingBinModal open={trashOpen} onClose={() => setTrashOpen(false)} />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialTab={settingsTab}
      />
      <ModelEditorModal
        model={editingModel}
        onClose={() => setEditingModelId(null)}
        onRequestDelete={requestDeleteModels}
      />
      <DeleteConfirmModal
        models={pendingDeleteModels}
        onClose={() => setPendingDeleteModels([])}
        onConfirmRecycle={(ids) => deleteModels(ids)}
        onConfirmArchiveToTier={(ids, tierId) =>
          bulkUpdateModels(ids, { tierId })
        }
      />

      {/* Toast Stack */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm">
          {toasts.map((toast) => {
            const toneClass =
              toast.tone === 'success'
                ? 'border-emerald-500/40 bg-[#101C18]'
                : toast.tone === 'warning'
                  ? 'border-amber-500/40 bg-[#1B160F]'
                  : toast.tone === 'error'
                    ? 'border-rose-500/40 bg-[#1D1014]'
                    : 'border-indigo-500/35 bg-[#121622]';

            return (
              <div
                key={toast.id}
                className={`animate-toast-in flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border shadow-xl text-xs text-slate-100 ${toneClass}`}
              >
                <span>{toast.message}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {toast.undoAction && (
                    <button
                      type="button"
                      onClick={() => {
                        toast.undoAction?.();
                        dismissToast(toast.id);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[11px] font-medium"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Undo
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => dismissToast(toast.id)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

interface AppErrorBoundaryState {
  error: Error | null;
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  AppErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="h-full flex items-center justify-center bg-[#090B10] text-slate-100 p-6">
          <div className="max-w-md w-full p-6 rounded-2xl bg-[#11141D] border border-rose-500/35 space-y-4 text-center">
            <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
            <h2 className="text-base font-semibold text-white">
              WatchPulse encountered a rendering error
            </h2>
            <p className="text-xs text-slate-400 break-words">
              {this.state.error.message}
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => this.setState({ error: null })}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white"
              >
                Recover Workspace
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-xl text-xs font-medium bg-white/10 hover:bg-white/15 text-slate-200"
              >
                Reload App
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function App() {
  return (
    <AppErrorBoundary>
      <AppProvider>
        <StudioShell />
      </AppProvider>
    </AppErrorBoundary>
  );
}

export default App;
