import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { syncWorkspaceMetadataWithRetry } from "@/lib/workspace";
import {
  fetchUserWorkspaceProfiles,
  type WorkspaceCentroSummary,
  type WorkspaceClienteSummary,
  type WorkspaceOption,
} from "@/lib/workspaceProfiles";
import type { Perfil } from "@/types/database";
import { enforceDemoTrial, isDemoTenantId } from "@/lib/demoTrial";

export type { WorkspaceOption };

interface AppContextValue {
  session: Session | null;
  loading: boolean;
  perfilesLoading: boolean;
  perfiles: Perfil[];
  activePerfil: Perfil | null;
  activeCliente: WorkspaceClienteSummary | null;
  activeCentro: WorkspaceCentroSummary | null;
  workspaceOptions: WorkspaceOption[];
  hasMultipleProfiles: boolean;
  setActivePerfilId: (id: string) => void;
  activateWorkspace: (perfilId: string) => Promise<void>;
  isAuthenticated: boolean;
  needsTenantSelection: boolean;
  demoTrialBlocked: boolean;
  demoTrialChecking: boolean;
  demoTrialError: string | null;
  workspaceSyncError: string | null;
  refreshDemoTrialGate: () => Promise<boolean>;
  signOut: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

const STORAGE_KEY = "activePerfilId";

export const ACTIVE_PERFIL_STORAGE_KEY = STORAGE_KEY;

export function AppProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [perfilesLoading, setPerfilesLoading] = useState(false);
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [activePerfilId, setActivePerfilIdState] = useState<string | null>(null);
  const [activeCliente, setActiveCliente] = useState<WorkspaceClienteSummary | null>(null);
  const [activeCentro, setActiveCentro] = useState<WorkspaceCentroSummary | null>(null);
  const [workspaceOptions, setWorkspaceOptions] = useState<WorkspaceOption[]>([]);
  const [demoTrialBlocked, setDemoTrialBlocked] = useState(false);
  const [demoTrialChecking, setDemoTrialChecking] = useState(false);
  const [demoTrialError, setDemoTrialError] = useState<string | null>(null);
  const [workspaceSyncError, setWorkspaceSyncError] = useState<string | null>(null);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      if (typeof window !== "undefined") {
        if (event === "SIGNED_IN") {
          window.sessionStorage.setItem("demo_cal_real_login", "1");
        } else if (event === "SIGNED_OUT") {
          window.sessionStorage.removeItem("demo_cal_real_login");
        }
      }
      setSession(s);
      if (!s) {
        setPerfiles([]);
        setActivePerfilIdState(null);
        setActiveCliente(null);
        setActiveCentro(null);
        setWorkspaceOptions([]);
        setDemoTrialBlocked(false);
        setDemoTrialChecking(false);
        setDemoTrialError(null);
        setWorkspaceSyncError(null);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user?.id) return;
    let cancelled = false;

    (async () => {
      setPerfilesLoading(true);
      let profilesLoadedOk = false;
      try {
        await supabase.rpc("ensure_my_profiles_single_center");
        const options = await fetchUserWorkspaceProfiles(session.user.id);
        if (cancelled) return;

        const rows = options.map((o) => o.perfil);
        setWorkspaceOptions(options);
        setPerfiles(rows);
        profilesLoadedOk = true;

        const stored =
          typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
        const storedValid = stored ? rows.find((p) => p.ID_PERFIL === stored) : null;
        const jwtPerfilId = String(session.user.user_metadata?.current_perfil_id ?? "").trim();
        const jwtValid = jwtPerfilId ? rows.find((p) => p.ID_PERFIL === jwtPerfilId) : null;

        let chosenPerfilId: string | null = null;
        if (storedValid) {
          chosenPerfilId = storedValid.ID_PERFIL;
        } else if (jwtValid) {
          chosenPerfilId = jwtValid.ID_PERFIL;
          if (typeof window !== "undefined") {
            window.localStorage.setItem(STORAGE_KEY, jwtPerfilId);
          }
        } else if (rows.length === 1) {
          chosenPerfilId = rows[0].ID_PERFIL;
          if (typeof window !== "undefined") {
            window.localStorage.setItem(STORAGE_KEY, rows[0].ID_PERFIL);
          }
        }

        if (chosenPerfilId) {
          const perfil = rows.find((p) => p.ID_PERFIL === chosenPerfilId);
          if (perfil) {
            const jwtMatches = jwtPerfilId === chosenPerfilId;
            try {
              if (!jwtMatches) {
                const jwtPerfilIdEmpty = jwtPerfilId.length === 0;
                await syncWorkspaceMetadataWithRetry(perfil, jwtPerfilIdEmpty ? 2 : 1);
                if (cancelled) return;
                const { data: refreshed } = await supabase.auth.getSession();
                if (refreshed.session) setSession(refreshed.session);
              }
            } catch (syncError) {
              console.error("Failed to sync workspace metadata (JWT refresh)", syncError);
              if (cancelled) return;
              const fallbackPerfilId = storedValid?.ID_PERFIL ?? jwtValid?.ID_PERFIL ?? null;
              if (fallbackPerfilId) {
                setActivePerfilIdState(fallbackPerfilId);
              } else {
                setActivePerfilIdState(null);
              }
              setWorkspaceSyncError(
                syncError instanceof Error
                  ? syncError.message
                  : "No se pudo sincronizar el workspace.",
              );
              return;
            }
            setActivePerfilIdState(chosenPerfilId);
            setWorkspaceSyncError(null);
          } else {
            setActivePerfilIdState(null);
            setWorkspaceSyncError(null);
          }
        } else {
          setActivePerfilIdState(null);
          setWorkspaceSyncError(null);
        }
      } catch (error) {
        console.error("Failed to load PERFILES", error);
        if (!cancelled && !profilesLoadedOk) {
          setPerfiles([]);
          setWorkspaceOptions([]);
        }
      } finally {
        if (!cancelled) setPerfilesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!activePerfilId) {
      setActiveCliente(null);
      setActiveCentro(null);
      return;
    }

    const option = workspaceOptions.find((o) => o.perfil.ID_PERFIL === activePerfilId);
    setActiveCliente(option?.cliente ?? null);
    setActiveCentro(option?.centro ?? null);
  }, [activePerfilId, workspaceOptions]);

  const refreshDemoTrialGate = useCallback(async (): Promise<boolean> => {
    const perfil = perfiles.find((p) => p.ID_PERFIL === activePerfilId) ?? null;
    if (!perfil || !isDemoTenantId(perfil.ID_CLIENTE)) {
      setDemoTrialBlocked(false);
      setDemoTrialError(null);
      return true;
    }

    try {
      const result = await enforceDemoTrial(perfil.ID_CLIENTE);
      setDemoTrialBlocked(result.expired);
      setDemoTrialError(null);
      return !result.expired;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo comprobar la prueba demo";
      setDemoTrialError(message);
      throw error;
    }
  }, [activePerfilId, perfiles]);

  useEffect(() => {
    if (!activePerfilId || perfilesLoading) return;

    const perfil = perfiles.find((p) => p.ID_PERFIL === activePerfilId);
    if (!perfil || !isDemoTenantId(perfil.ID_CLIENTE)) {
      setDemoTrialBlocked(false);
      setDemoTrialError(null);
      return;
    }

    let cancelled = false;

    (async () => {
      setDemoTrialChecking(true);
      try {
        const result = await enforceDemoTrial(perfil.ID_CLIENTE);
        if (cancelled) return;
        setDemoTrialBlocked(result.expired);
        setDemoTrialError(null);
      } catch (error) {
        if (cancelled) return;
        setDemoTrialError(
          error instanceof Error ? error.message : "No se pudo comprobar la prueba demo",
        );
      } finally {
        if (!cancelled) setDemoTrialChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activePerfilId, perfiles, perfilesLoading]);

  const setActivePerfilId = useCallback((id: string) => {
    setActivePerfilIdState(id);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const activateWorkspace = useCallback(
    async (perfilId: string) => {
      const option = workspaceOptions.find((o) => o.perfil.ID_PERFIL === perfilId);
      const perfil = option?.perfil ?? perfiles.find((p) => p.ID_PERFIL === perfilId);
      if (!perfil) throw new Error("Perfil de workspace no encontrado.");

      await syncWorkspaceMetadataWithRetry(perfil);
      setWorkspaceSyncError(null);
      setActivePerfilIdState(perfilId);
      setActiveCliente(option?.cliente ?? null);
      setActiveCentro(option?.centro ?? null);
      if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, perfilId);
      queryClient.clear();
    },
    [perfiles, workspaceOptions, queryClient],
  );

  const signOut = useCallback(async () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem("mobile_bouncer_dismissed");
    }
    queryClient.clear();
    await supabase.auth.signOut();
  }, [queryClient]);

  const activePerfil = perfiles.find((p) => p.ID_PERFIL === activePerfilId) ?? null;
  const hasMultipleProfiles = perfiles.length > 1;

  const value = useMemo<AppContextValue>(
    () => ({
      session,
      loading,
      perfilesLoading,
      perfiles,
      activePerfil,
      activeCliente,
      activeCentro,
      workspaceOptions,
      hasMultipleProfiles,
      setActivePerfilId,
      activateWorkspace,
      isAuthenticated: !!session,
      needsTenantSelection: !!session && hasMultipleProfiles && !activePerfil,
      demoTrialBlocked,
      demoTrialChecking,
      demoTrialError,
      workspaceSyncError,
      refreshDemoTrialGate,
      signOut,
    }),
    [
      session,
      loading,
      perfilesLoading,
      perfiles,
      activePerfil,
      activeCliente,
      activeCentro,
      workspaceOptions,
      hasMultipleProfiles,
      setActivePerfilId,
      activateWorkspace,
      demoTrialBlocked,
      demoTrialChecking,
      demoTrialError,
      workspaceSyncError,
      refreshDemoTrialGate,
      signOut,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within <AppProvider>");
  return ctx;
}

export function useActiveTenant() {
  const { activePerfil, activeCliente, activeCentro } = useApp();
  if (!activePerfil) {
    throw new Error("useActiveTenant called without an active tenant — wrap in _authenticated");
  }
  return {
    tenantId: activePerfil.ID_CLIENTE,
    centerId: activePerfil.ID_CENTRO,
    rol: activePerfil.ROL,
    perfil: activePerfil,
    cliente: activeCliente,
    centro: activeCentro,
  };
}
