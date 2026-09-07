import { useMemo } from "react";
import { useTurnos, type TurnoData } from "@/hooks/useTurnos";
import { useActiveTenant } from "@/context/AppContext";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const DAY_ORDER: Record<string, number> = {
  Lunes: 1,
  Martes: 2,
  Miercoles: 3,
  Miércoles: 3,
  Jueves: 4,
  Viernes: 5,
  Sabado: 6,
  Sábado: 6,
  Domingo: 7,
};

function normalizeDayKey(dia: string | null | undefined): string {
  if (!dia) return "";
  return dia.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function daySortKey(dia: string | null | undefined): number {
  if (!dia) return 99;
  const direct = DAY_ORDER[dia];
  if (direct != null) return direct;
  const normalized = normalizeDayKey(dia);
  for (const [key, order] of Object.entries(DAY_ORDER)) {
    if (normalizeDayKey(key) === normalized) return order;
  }
  return 99;
}

function toTimeInputValue(value: string | null | undefined): string {
  if (!value) return "";
  const match = value.match(/^(\d{2}:\d{2})/);
  return match ? match[1] : value.slice(0, 5);
}

function formatTimeBlock(abre: string | null, cierra: string | null): string {
  if (!abre && !cierra) return "Sin horario";
  const a = abre ? toTimeInputValue(abre) : "—";
  const c = cierra ? toTimeInputValue(cierra) : "—";
  return `${a} – ${c}`;
}

function hasSchedule(turno: TurnoData): boolean {
  return !!(turno.ABRE_MAÑANA || turno.CIERRA_MAÑANA || turno.ABRE_TARDE || turno.CIERRA_TARDE);
}

function TurnoDayCard({ turno }: { turno: TurnoData }) {
  const active = hasSchedule(turno);

  return (
    <Card className="p-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">{turno.DIA_SEMANA}</h3>
          <Badge variant={active ? "secondary" : "outline"} className="text-xs font-normal">
            {active ? "Con horario" : "Sin horario"}
          </Badge>
        </div>
        <div className="grid gap-1 text-sm">
          <p>
            <span className="text-muted-foreground">Mañana: </span>
            <span className="font-mono tabular-nums">
              {formatTimeBlock(turno.ABRE_MAÑANA, turno.CIERRA_MAÑANA)}
            </span>
          </p>
          <p>
            <span className="text-muted-foreground">Tarde: </span>
            <span className="font-mono tabular-nums">
              {formatTimeBlock(turno.ABRE_TARDE, turno.CIERRA_TARDE)}
            </span>
          </p>
        </div>
        {turno.TEXTO_ESPECIALIDADES !== "—" ? (
          <p className="text-xs text-muted-foreground">{turno.TEXTO_ESPECIALIDADES}</p>
        ) : null}
      </div>
    </Card>
  );
}

export function TeacherTurnosDashboard() {
  const { perfil } = useActiveTenant();
  const { list } = useTurnos();

  const myTurnos = useMemo(() => {
    const profId = perfil.ID_PROFESOR;
    if (!profId) return [];
    return (list.data?.turnos ?? [])
      .filter((t) => t.ID_PROFESOR === profId)
      .sort((a, b) => daySortKey(a.DIA_SEMANA) - daySortKey(b.DIA_SEMANA));
  }, [list.data?.turnos, perfil.ID_PROFESOR]);

  const configuredDays = useMemo(() => myTurnos.filter(hasSchedule).length, [myTurnos]);

  if (list.isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (list.isError) {
    return (
      <Card className="border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        Error al cargar disponibilidad: {(list.error as Error)?.message}
      </Card>
    );
  }

  if (!perfil.ID_PROFESOR) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        Tu perfil no está vinculado a un profesor.
      </Card>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {myTurnos.length} días · {configuredDays} con horario definido
        </span>
        <span>Solo consulta. Contacta con secretaría para modificar horarios.</span>
      </div>

      {myTurnos.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No hay disponibilidad horaria registrada todavía.
        </Card>
      ) : (
        <div className="space-y-3">
          {myTurnos.map((turno) => (
            <TurnoDayCard key={turno.ID_TURNO} turno={turno} />
          ))}
        </div>
      )}
    </>
  );
}
