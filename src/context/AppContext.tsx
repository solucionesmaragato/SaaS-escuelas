import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { syncWorkspaceMetadata } from "@/lib/workspace";
import {
  fetchUserWorkspaceProfiles,
  type WorkspaceCentroSummary,
  type WorkspaceClienteSummary,
  type WorkspaceOption,
} from "@/lib/workspaceProfiles";
import type { Perfil } from "@/types/database";

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
  signOut: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

const STORAGE_KEY = "activePerfilId";

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

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) {
        setPerfiles([]);
        setActivePerfilIdState(null);
        setActiveCliente(null);
        setActiveCentro(null);
        setWorkspaceOptions([]);
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
      try {
        const options = await fetchUserWorkspaceProfiles(session.user.id);
        if (cancelled) return;

        const rows = options.map((o) => o.perfil);
        setWorkspaceOptions(options);
        setPerfiles(rows);

        const stored =
          typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
        const storedValid = stored ? rows.find((p) => p.ID_PERFIL === stored) : null;

        if (storedValid) {
          setActivePerfilIdState(stored);
        } else if (rows.length === 1) {
          setActivePerfilIdState(rows[0].ID_PERFIL);
          if (typeof window !== "undefined") {
            window.localStorage.setItem(STORAGE_KEY, rows[0].ID_PERFIL);
          }
        } else {
          setActivePerfilIdState(null);
        }
      } catch (error) {
        console.error("Failed to load PERFILES", error);
        if (!cancelled) {
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

  useEffect(() => {
    if (!session?.user?.id || !activePerfilId) return;
    const perfil = perfiles.find((p) => p.ID_PERFIL === activePerfilId);
    if (!perfil) return;

    syncWorkspaceMetadata(perfil).catch((err) => {
      console.error("Failed to sync workspace metadata", err);
    });
  }, [activePerfilId, perfiles, session?.user?.id]);

  const setActivePerfilId = useCallback((id: string) => {
    setActivePerfilIdState(id);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const activateWorkspace = useCallback(
    async (perfilId: string) => {
      const option = workspaceOptions.find((o) => o.perfil.ID_PERFIL === perfilId);
      const perfil = option?.perfil ?? perfiles.find((p) => p.ID_PERFIL === perfilId);
      if (!perfil) throw new Error("Perfil de workspace no encontrado.");

      await syncWorkspaceMetadata(perfil);
      setActivePerfilIdState(perfilId);
      setActiveCliente(option?.cliente ?? null);
      setActiveCentro(option?.centro ?? null);
      if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, perfilId);
      queryClient.clear();
    },
    [perfiles, workspaceOptions, queryClient],
  );

  const signOut = useCallback(async () => {
    if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
    queryClient.clear();
    await supabase.auth.signOut();
  }, [queryClient]);

  const activePerfil = perfiles.find((p) => p.ID_PERFIL === activePerfilId) ?? null;
  const hasMultipleProfiles = perfiles.length > 1;

  const value: AppContextValue = {
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
    signOut,
  };

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
