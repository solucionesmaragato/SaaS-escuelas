export type MatriculaTextoFieldKey =
  | "TEXTO_REGIMEN_INTERNO"
  | "TEXTO_AUT_MEDIOS"
  | "TEXTO_AUT_INSTALACIONES"
  | "TEXTO_AUT_WEB"
  | "TEXTO_AUT_RRSS"
  | "TEXTO_AUT_COMUNICACION";

export type MatriculaTextoFieldDef = {
  key: MatriculaTextoFieldKey;
  label: string;
  placeholder?: string;
};

export const MATRICULA_TEXTOS_SECTION_TITLE = "Textos legales — matrícula online";

export const MATRICULA_TEXTOS_SECTION_SUBTITLE =
  "Se muestran en el formulario público /matricular. Todos son opcionales.";

export const MATRICULA_TEXTOS_FIELDS: MatriculaTextoFieldDef[] = [
  {
    key: "TEXTO_REGIMEN_INTERNO",
    label: "Régimen interno",
    placeholder: "Normas, requisitos y régimen interno de la escuela…",
  },
  {
    key: "TEXTO_AUT_MEDIOS",
    label: "Autorización de medios",
    placeholder: "Ej.: autorización para grabación en clase…",
  },
  {
    key: "TEXTO_AUT_INSTALACIONES",
    label: "Autorización de instalaciones",
    placeholder: "Ej.: uso de instalaciones y normas de seguridad…",
  },
  {
    key: "TEXTO_AUT_WEB",
    label: "Autorización web",
    placeholder: "Ej.: publicación de imágenes en la web de la escuela…",
  },
  {
    key: "TEXTO_AUT_RRSS",
    label: "Autorización redes sociales",
    placeholder: "Ej.: publicación en Instagram, Facebook…",
  },
  {
    key: "TEXTO_AUT_COMUNICACION",
    label: "Autorización comunicaciones",
    placeholder: "Ej.: WhatsApp, teléfono, email y otros canales…",
  },
];

export function getMatriculaTextoLabel(key: MatriculaTextoFieldKey): string {
  return MATRICULA_TEXTOS_FIELDS.find((field) => field.key === key)?.label ?? key;
}

export type MatriculaPdfTextoLegal = {
  titulo: string;
  cuerpo: string;
};

export function buildMatriculaPdfTextosLegales(
  values: Partial<Record<MatriculaTextoFieldKey, string | null | undefined>>,
): MatriculaPdfTextoLegal[] {
  return MATRICULA_TEXTOS_FIELDS.flatMap((field) => {
    const cuerpo = values[field.key]?.trim();
    if (!cuerpo) return [];
    return [{ titulo: field.label, cuerpo }];
  });
}

export function buildMatriculaPdfTextosLegalesFromSolicitud(textos: {
  regimen_interno?: string | null;
  aut_medios?: string | null;
  aut_instalaciones?: string | null;
  aut_web?: string | null;
  aut_rrss?: string | null;
  aut_comunicacion?: string | null;
} | null | undefined): MatriculaPdfTextoLegal[] {
  if (!textos) return [];
  return buildMatriculaPdfTextosLegales({
    TEXTO_REGIMEN_INTERNO: textos.regimen_interno,
    TEXTO_AUT_MEDIOS: textos.aut_medios,
    TEXTO_AUT_INSTALACIONES: textos.aut_instalaciones,
    TEXTO_AUT_WEB: textos.aut_web,
    TEXTO_AUT_RRSS: textos.aut_rrss,
    TEXTO_AUT_COMUNICACION: textos.aut_comunicacion,
  });
}
