import { useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin, { Draggable } from "@fullcalendar/interaction";
import type { EventReceiveArg, EventResizeDoneArg } from "@fullcalendar/interaction";
import type { EventDropArg, EventInput } from "@fullcalendar/core";
import { GripVertical, Loader2, Plus } from "lucide-react";
import { useSandboxCalendario } from "@/hooks/useSandboxCalendario";
import {
  FC_HIDDEN_SUNDAY,
  SANDBOX_SLOT_MAX,
  SANDBOX_SLOT_MIN,
  dateToSandboxDay,
  formatTimeFromDate,
  rowsToCalendarEvents,
} from "@/lib/sandboxCalendarUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const DEFAULT_UNASSIGNED_GROUPS = [
  "Grupo Piano Principiantes",
  "Grupo Guitarra Juvenil",
  "Grupo Canto Grupal",
  "Grupo Violín Avanzado",
  "Grupo Batería Rock",
  "Grupo Lenguaje Musical",
  "Grupo Ensamble Cámara",
];

type UnassignedGroup = {
  id: string;
  title: string;
};

function buildDefaultUnassigned(): UnassignedGroup[] {
  return DEFAULT_UNASSIGNED_GROUPS.map((title, index) => ({
    id: `unassigned-${index}`,
    title,
  }));
}

function persistScheduleFromEvent(
  start: Date | null,
  end: Date | null,
): { DIA: number; HORA_INICIO: string; HORA_FIN: string } {
  if (!start || !end) throw new Error("Horario inválido.");
  return {
    DIA: dateToSandboxDay(start),
    HORA_INICIO: formatTimeFromDate(start),
    HORA_FIN: formatTimeFromDate(end),
  };
}

export function SandboxScheduleBuilder() {
  const { list, create, update } = useSandboxCalendario();
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [unassignedGroups, setUnassignedGroups] = useState<UnassignedGroup[]>(buildDefaultUnassigned);
  const [newGroupName, setNewGroupName] = useState("");

  const calendarEvents = useMemo<EventInput[]>(
    () => rowsToCalendarEvents(list.data ?? []),
    [list.data],
  );

  useEffect(() => {
    const container = sidebarRef.current;
    if (!container) return;

    const draggable = new Draggable(container, {
      itemSelector: ".sandbox-external-event",
      eventData: (eventEl) => {
        const title = eventEl.getAttribute("data-title") ?? eventEl.textContent?.trim() ?? "Grupo";
        const sourceId = eventEl.getAttribute("data-id") ?? crypto.randomUUID();
        return {
          title,
          duration: { hours: 1 },
          extendedProps: {
            sourceId,
            nombreGrupo: title,
          },
        };
      },
    });

    return () => draggable.destroy();
  }, [unassignedGroups]);

  const handleEventReceive = async (info: EventReceiveArg) => {
    const nombreGrupo =
      (info.event.extendedProps.nombreGrupo as string | undefined) ??
      info.event.title ??
      "Grupo sin nombre";
    const sourceId = info.event.extendedProps.sourceId as string | undefined;

    try {
      const schedule = persistScheduleFromEvent(info.event.start, info.event.end);
      const created = await create.mutateAsync({
        NOMBRE_GRUPO: nombreGrupo,
        ...schedule,
      });

      info.event.setProp("id", created.ID_SANDBOX_CALENDARIO);
      info.event.setExtendedProp("sandboxId", created.ID_SANDBOX_CALENDARIO);

      if (sourceId) {
        setUnassignedGroups((prev) => prev.filter((g) => g.id !== sourceId));
      }

      toast.success(`"${nombreGrupo}" programado`);
    } catch (err) {
      info.revert();
      toast.error(err instanceof Error ? err.message : "No se pudo guardar el grupo");
    }
  };

  const handleEventDrop = async (info: EventDropArg) => {
    const sandboxId =
      (info.event.extendedProps.sandboxId as string | undefined) ?? info.event.id;
    if (!sandboxId) {
      info.revert();
      return;
    }

    try {
      const schedule = persistScheduleFromEvent(info.event.start, info.event.end);
      await update.mutateAsync({ id: sandboxId, patch: schedule });
      toast.success("Horario actualizado");
    } catch (err) {
      info.revert();
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar el horario");
    }
  };

  const handleEventResize = async (info: EventResizeDoneArg) => {
    const sandboxId =
      (info.event.extendedProps.sandboxId as string | undefined) ?? info.event.id;
    if (!sandboxId) {
      info.revert();
      return;
    }

    try {
      const schedule = persistScheduleFromEvent(info.event.start, info.event.end);
      await update.mutateAsync({ id: sandboxId, patch: schedule });
      toast.success("Duración actualizada");
    } catch (err) {
      info.revert();
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar la duración");
    }
  };

  const addUnassignedGroup = () => {
    const title = newGroupName.trim();
    if (!title) return;
    setUnassignedGroups((prev) => [...prev, { id: crypto.randomUUID(), title }]);
    setNewGroupName("");
  };

  const isSaving = create.isPending || update.isPending;

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-[640px] gap-4">
      <aside className="flex w-72 shrink-0 flex-col rounded-xl border bg-card shadow-sm">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Grupos sin asignar</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Arrastra un grupo al calendario para programarlo.
          </p>
        </div>

        <div ref={sidebarRef} className="flex-1 space-y-2 overflow-y-auto p-3">
          {unassignedGroups.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
              Todos los grupos están programados. Añade uno nuevo abajo.
            </p>
          ) : (
            unassignedGroups.map((group) => (
              <div
                key={group.id}
                data-id={group.id}
                data-title={group.title}
                className="sandbox-external-event flex cursor-grab items-center gap-2 rounded-lg border bg-background px-3 py-2.5 text-sm font-medium shadow-sm transition hover:border-primary/40 hover:bg-muted/40 active:cursor-grabbing"
              >
                <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{group.title}</span>
              </div>
            ))
          )}
        </div>

        <div className="flex gap-2 border-t p-3">
          <Input
            placeholder="Nuevo grupo..."
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addUnassignedGroup()}
            className="h-9 text-sm"
          />
          <Button type="button" size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={addUnassignedGroup}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </aside>

      <section className="relative min-w-0 flex-1 overflow-hidden rounded-xl border bg-card p-3 shadow-sm">
        {(list.isLoading || isSaving) && (
          <div className="absolute right-4 top-4 z-10 flex items-center gap-2 rounded-md border bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {list.isLoading ? "Cargando calendario…" : "Guardando…"}
          </div>
        )}

        {list.isError && (
          <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            Error al cargar SANDBOX_CALENDARIO: {(list.error as Error).message}
          </div>
        )}

        <div className="sandbox-calendar h-full [&_.fc]:h-full [&_.fc-col-header-cell-cushion]:text-xs [&_.fc-event]:cursor-grab [&_.fc-event]:rounded-md [&_.fc-event]:border-0 [&_.fc-event]:px-1.5 [&_.fc-event]:py-0.5 [&_.fc-event]:text-xs [&_.fc-event-title]:font-medium [&_.fc-scrollgrid]:border-border [&_.fc-timegrid-axis-cushion]:text-xs [&_.fc-timegrid-slot-label-cushion]:text-xs [&_.fc-timegrid-slot]:h-12">
          <FullCalendar
            plugins={[timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            locale="es"
            firstDay={1}
            hiddenDays={[FC_HIDDEN_SUNDAY]}
            weekends
            allDaySlot={false}
            slotMinTime={SANDBOX_SLOT_MIN}
            slotMaxTime={SANDBOX_SLOT_MAX}
            slotDuration="00:30:00"
            snapDuration="00:15:00"
            height="100%"
            expandRows
            headerToolbar={{
              left: "title",
              center: "",
              right: "",
            }}
            editable
            droppable
            eventDurationEditable
            events={calendarEvents}
            eventReceive={handleEventReceive}
            eventDrop={handleEventDrop}
            eventResize={handleEventResize}
          />
        </div>
      </section>
    </div>
  );
}
