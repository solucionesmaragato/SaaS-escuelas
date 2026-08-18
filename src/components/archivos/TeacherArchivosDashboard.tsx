import { useRef, useState } from "react";
import {
  ChevronRight,
  FileImage,
  FileText,
  Folder,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  useArchivosProfesor,
  type ArchivoProfesorFile,
  type ArchivoProfesorFolder,
} from "@/hooks/useArchivosProfesor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const UPLOAD_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/gif";

type DeleteTarget =
  | { kind: "file"; path: string; name: string }
  | { kind: "folder"; path: string; name: string };

function displayFileName(storageName: string): string {
  const match = storageName.match(/^[0-9a-f-]{36}_(.+)$/i);
  return match ? match[1] : storageName;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isPdfFile(name: string): boolean {
  return name.toLowerCase().endsWith(".pdf");
}

function validateUploadFile(file: File): string | null {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    if (file.type.startsWith("video/")) {
      return "No se permiten vídeos. Solo PDF e imágenes (JPEG, PNG, WebP, GIF).";
    }
    return "Tipo de archivo no permitido. Solo PDF e imágenes (JPEG, PNG, WebP, GIF).";
  }
  if (file.size > 10 * 1024 * 1024) {
    return "El archivo supera el límite de 10 MB.";
  }
  return null;
}

function FolderRow({
  folder,
  onOpen,
  onDelete,
}: {
  folder: ArchivoProfesorFolder;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <Folder className="h-5 w-5 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{folder.name}</span>
        </button>
        <Button type="button" variant="ghost" size="icon" onClick={onDelete} aria-label="Eliminar carpeta">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </Card>
  );
}

function FileRow({
  file,
  onOpen,
  onDelete,
}: {
  file: ArchivoProfesorFile;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const label = displayFileName(file.name);
  const Icon = isPdfFile(file.name) ? FileText : FileImage;

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 space-y-1">
          <button type="button" onClick={onOpen} className="block w-full truncate text-left font-medium">
            {label}
          </button>
          <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onDelete} aria-label="Eliminar archivo">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </Card>
  );
}

export function TeacherArchivosDashboard() {
  const [carpeta, setCarpeta] = useState<string | null>(null);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [openingPath, setOpeningPath] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const { list, upload, createFolder, remove, signedUrl } = useArchivosProfesor(carpeta);

  const folders = list.data?.folders ?? [];
  const files = list.data?.files ?? [];
  const isEmpty = !list.isLoading && folders.length === 0 && files.length === 0;

  const handleCreateFolder = async () => {
    const nombre = folderName.trim();
    if (!nombre) {
      toast.error("Indica un nombre para la carpeta.");
      return;
    }
    try {
      await createFolder.mutateAsync(nombre);
      toast.success("Carpeta creada.");
      setFolderDialogOpen(false);
      setFolderName("");
    } catch (error) {
      toast.error((error as Error)?.message ?? "No se pudo crear la carpeta.");
    }
  };

  const handleUpload = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;

    const validationError = validateUploadFile(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    try {
      await upload.mutateAsync({ file, carpeta });
      toast.success("Archivo subido.");
    } catch (error) {
      toast.error((error as Error)?.message ?? "No se pudo subir el archivo.");
    } finally {
      if (uploadInputRef.current) {
        uploadInputRef.current.value = "";
      }
    }
  };

  const handleOpen = async (path: string) => {
    setOpeningPath(path);
    try {
      const url = await signedUrl(path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error((error as Error)?.message ?? "No se pudo abrir el archivo.");
    } finally {
      setOpeningPath(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.path);
      toast.success(deleteTarget.kind === "folder" ? "Carpeta eliminada." : "Archivo eliminado.");
      setDeleteTarget(null);
    } catch (error) {
      toast.error((error as Error)?.message ?? "No se pudo eliminar.");
    }
  };

  return (
    <>
      <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <button
          type="button"
          onClick={() => setCarpeta(null)}
          className={carpeta ? "font-medium text-primary hover:underline" : "font-semibold text-foreground"}
        >
          Mis archivos
        </button>
        {carpeta ? (
          <>
            <ChevronRight className="h-4 w-4 shrink-0" />
            <span className="truncate font-semibold text-foreground">{carpeta}</span>
          </>
        ) : null}
      </nav>

      <div className="flex flex-wrap gap-2">
        {!carpeta ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setFolderDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Crear carpeta
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={upload.isPending}
          onClick={() => uploadInputRef.current?.click()}
        >
          <Upload className="mr-2 h-4 w-4" />
          Subir archivo
        </Button>
        <input
          ref={uploadInputRef}
          type="file"
          accept={UPLOAD_ACCEPT}
          className="hidden"
          onChange={(event) => void handleUpload(event.target.files)}
        />
      </div>

      {list.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : null}

      {list.isError ? (
        <Card className="border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Error al cargar archivos: {(list.error as Error)?.message}
        </Card>
      ) : null}

      {!list.isLoading && !list.isError ? (
        <>
          {isEmpty ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              {carpeta
                ? "Esta carpeta está vacía. Sube un PDF o una imagen."
                : "Todavía no hay carpetas ni archivos. Crea una carpeta o sube un archivo."}
            </Card>
          ) : (
            <div className="space-y-3">
              {folders.map((folder) => (
                <FolderRow
                  key={folder.path}
                  folder={folder}
                  onOpen={() => setCarpeta(folder.name)}
                  onDelete={() =>
                    setDeleteTarget({ kind: "folder", path: folder.path, name: folder.name })
                  }
                />
              ))}
              {files.map((file) => (
                <FileRow
                  key={file.path}
                  file={file}
                  onOpen={() => void handleOpen(file.path)}
                  onDelete={() =>
                    setDeleteTarget({
                      kind: "file",
                      path: file.path,
                      name: displayFileName(file.name),
                    })
                  }
                />
              ))}
            </div>
          )}
        </>
      ) : null}

      {openingPath ? (
        <p className="text-xs text-muted-foreground">Abriendo archivo…</p>
      ) : null}

      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva carpeta</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="archivos-folder-name">Nombre</Label>
            <Input
              id="archivos-folder-name"
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              placeholder="Ej. Clases piano"
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleCreateFolder();
              }}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setFolderDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void handleCreateFolder()} disabled={createFolder.isPending}>
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.kind === "folder" ? "Eliminar carpeta" : "Eliminar archivo"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.kind === "folder"
                ? `¿Eliminar la carpeta "${deleteTarget.name}"? Solo se puede borrar si está vacía.`
                : `¿Eliminar "${deleteTarget?.name}"? Esta acción no se puede deshacer.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmDelete();
              }}
              disabled={remove.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
