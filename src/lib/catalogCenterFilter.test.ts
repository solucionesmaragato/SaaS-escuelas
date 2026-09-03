import { describe, expect, it } from "vitest";
import {
  catalogMatchesCenter,
  CATALOG_ALL_CENTROS_LABEL,
  filterCatalogByCenter,
  formatCatalogCentroLabel,
} from "./catalogCenterFilter";

describe("catalogMatchesCenter", () => {
  it("sin centro activo incluye todas las filas", () => {
    expect(catalogMatchesCenter(null, null)).toBe(true);
    expect(catalogMatchesCenter("CEN_001", undefined)).toBe(true);
  });

  it("con centro activo incluye catálogo tenant-wide y el centro", () => {
    expect(catalogMatchesCenter(null, "CEN_001")).toBe(true);
    expect(catalogMatchesCenter("CEN_001", "CEN_001")).toBe(true);
    expect(catalogMatchesCenter("CEN_002", "CEN_001")).toBe(false);
  });
});

describe("filterCatalogByCenter", () => {
  const rows = [
    { ID_TARIFA: "t1", ID_CENTRO: null },
    { ID_TARIFA: "t2", ID_CENTRO: "CEN_001" },
    { ID_TARIFA: "t3", ID_CENTRO: "CEN_002" },
  ];

  it("devuelve todas las filas sin filtro de centro", () => {
    expect(filterCatalogByCenter(rows, null)).toHaveLength(3);
  });

  it("filtra por centro activo manteniendo catálogo sin sede", () => {
    expect(filterCatalogByCenter(rows, "CEN_001").map((r) => r.ID_TARIFA)).toEqual(["t1", "t2"]);
  });
});

describe("formatCatalogCentroLabel", () => {
  const nombres = new Map([["CEN_001", "Madrid"]]);

  it("muestra Todas las sedes cuando ID_CENTRO es null", () => {
    expect(formatCatalogCentroLabel(null, nombres)).toBe(CATALOG_ALL_CENTROS_LABEL);
  });

  it("resuelve nombre de centro o cae al id", () => {
    expect(formatCatalogCentroLabel("CEN_001", nombres)).toBe("Madrid");
    expect(formatCatalogCentroLabel("CEN_002", nombres)).toBe("CEN_002");
  });
});
