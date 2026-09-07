# Scripts de matrícula (one-shot)

Flujo por cliente (`ID_CLIENTE`, p. ej. `ESC_018`):

## 1. Backfill (solo si faltan firmadas)

Inserta `SOLICITUDES_MATRICULA` firmadas sintéticas para alumnos **Activos** sin solicitud firmada.

```bash
# Revisar (máx. 5)
npx tsx scripts/backfill-matricula-firmada-sintetica.ts ESC_018 --dry-run

# Ejecutar
npx tsx scripts/backfill-matricula-firmada-sintetica.ts ESC_018
```

Requisitos en `.env`: `SUPABASE_URL` (o `VITE_SUPABASE_URL`) y `SUPABASE_SERVICE_ROLE_KEY`.

## 2. Export PDF

Genera un PDF por solicitud firmada (misma lógica que la UI: verificación de hash + `mapSolicitudToMatriculaPdfInput`).

```bash
npx tsx scripts/export-matriculas-pdf.ts ESC_018
# → matriculas-export/ESC_018/
```

Directorio opcional:

```bash
npx tsx scripts/export-matriculas-pdf.ts ESC_018 --out-dir matriculas-export/ESC_018
```

## Verificación

- Comparar un PDF de disco con **Alumnos → alumno → Descargar matrícula firmada**.
- Los PDFs se nombran `Matricula_<nombre>_<ID_ALUMNO>.pdf`.
