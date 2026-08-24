import { describe, expect, it } from "vitest";
import {
  classifyProfesorDashboardLive,
  getLastClockMovement,
  type FichajeClockRecord,
} from "./dashboardProfesorEstado";

describe("classifyProfesorDashboardLive", () => {
  it("último Entrada + sesión → en_clase", () => {
    expect(
      classifyProfesorDashboardLive({
        hasActiveSession: true,
        lastClockMovement: "Entrada",
      }).bucket,
    ).toBe("en_clase");
  });

  it("último Salida + sesión → ocupado", () => {
    expect(
      classifyProfesorDashboardLive({
        hasActiveSession: true,
        lastClockMovement: "Salida",
      }).bucket,
    ).toBe("ocupado");
  });

  it("sin fichajes + sesión → ocupado", () => {
    expect(
      classifyProfesorDashboardLive({
        hasActiveSession: true,
        lastClockMovement: null,
      }).bucket,
    ).toBe("ocupado");
  });

  it("último Fin de Pausa + sin sesión → alerta_grave", () => {
    expect(
      classifyProfesorDashboardLive({
        hasActiveSession: false,
        lastClockMovement: "Fin de Pausa",
      }).bucket,
    ).toBe("alerta_grave");
  });

  it("último Salida + sin sesión → libre", () => {
    expect(
      classifyProfesorDashboardLive({
        hasActiveSession: false,
        lastClockMovement: "Salida",
      }).bucket,
    ).toBe("libre");
  });
});

describe("getLastClockMovement", () => {
  it('ignora "Corrección Pendiente" al calcular último movimiento reloj', () => {
    const records: FichajeClockRecord[] = [
      {
        ID_PROFESOR: "prof-1",
        TIPO_MOVIMIENTO: "Corrección Pendiente",
        FECHA_HORA_REAL: "2026-08-20T12:00:00.000Z",
      },
      {
        ID_PROFESOR: "prof-1",
        TIPO_MOVIMIENTO: "Salida",
        FECHA_HORA_REAL: "2026-08-20T11:00:00.000Z",
      },
      {
        ID_PROFESOR: "prof-1",
        TIPO_MOVIMIENTO: "Entrada",
        FECHA_HORA_REAL: "2026-08-20T10:00:00.000Z",
      },
    ];

    expect(getLastClockMovement(records)).toBe("Salida");
  });
});
