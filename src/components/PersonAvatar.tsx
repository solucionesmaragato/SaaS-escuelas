import { useEffect, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initialsFromName } from "@/lib/alumnosMatriculasUtils";
import { getSchoolAvatarClass } from "@/lib/workspace";
import { cn } from "@/lib/utils";

type PersonAvatarProps = {
  name: string;
  photoUrl?: string | null;
  className?: string;
  fallbackClassName?: string;
};

export function PersonAvatar({
  name,
  photoUrl,
  className,
  fallbackClassName,
}: PersonAvatarProps) {
  const trimmedUrl = photoUrl?.trim() ?? "";
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [trimmedUrl]);

  const showImage = !!trimmedUrl && !imageFailed;
  const initials = initialsFromName(name);
  const palette = getSchoolAvatarClass(name);

  return (
    <Avatar className={cn("shrink-0", className)}>
      {showImage ? (
        <img
          src={trimmedUrl}
          alt={name}
          className="aspect-square h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : null}
      <AvatarFallback
        className={cn("font-semibold", palette, fallbackClassName)}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
