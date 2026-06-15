import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { getSchoolAvatarClass, getSchoolInitials } from "@/lib/workspace";

type SchoolBrandAvatarProps = {
  schoolName: string;
  logoUrl?: string | null;
  className?: string;
  fallbackClassName?: string;
};

export function SchoolBrandAvatar({
  schoolName,
  logoUrl,
  className,
  fallbackClassName,
}: SchoolBrandAvatarProps) {
  const initials = getSchoolInitials(schoolName);
  const palette = getSchoolAvatarClass(schoolName);
  const hasLogo = !!logoUrl?.trim();

  return (
    <Avatar className={cn("h-14 w-14 rounded-full ring-2 ring-background shadow-sm", className)}>
      {hasLogo ? (
        <AvatarImage src={logoUrl!} alt={schoolName} className="object-cover" />
      ) : null}
      <AvatarFallback
        className={cn(
          "rounded-full text-base font-bold tracking-wide",
          palette,
          fallbackClassName,
        )}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
