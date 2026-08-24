import { Button } from "@/components/ui/button";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.24 1.4-1.66 4.1-5.5 4.1-3.3 0-6-2.74-6-6.1S8.7 5.9 12 5.9c1.88 0 3.14.8 3.86 1.49l2.63-2.54C16.95 3.36 14.7 2.4 12 2.4 6.92 2.4 2.8 6.52 2.8 11.6S6.92 20.8 12 20.8c6.93 0 9.2-4.86 9.2-7.4 0-.5-.05-.88-.12-1.2H12z"
      />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 23 23" className="h-5 w-5" aria-hidden>
      <path fill="#F25022" d="M0 0h11v11H0z" />
      <path fill="#7FBA00" d="M12 0h11v11H12z" />
      <path fill="#00A4EF" d="M0 12h11v11H0z" />
      <path fill="#FFB900" d="M12 12h11v11H12z" />
    </svg>
  );
}

interface OAuthProviderButtonsProps {
  submitting: boolean;
  onGoogle: () => void;
  onMicrosoft: () => void;
  googleLabel?: string;
  microsoftLabel?: string;
}

export function OAuthProviderButtons({
  submitting,
  onGoogle,
  onMicrosoft,
  googleLabel = "Continuar con Google",
  microsoftLabel = "Continuar con Microsoft",
}: OAuthProviderButtonsProps) {
  return (
    <>
      <Button
        type="button"
        onClick={onGoogle}
        disabled={submitting}
        variant="outline"
        size="lg"
        className="w-full justify-center gap-3"
      >
        <GoogleIcon />
        {submitting ? "Redirigiendo..." : googleLabel}
      </Button>

      <Button
        type="button"
        onClick={onMicrosoft}
        disabled={submitting}
        variant="outline"
        size="lg"
        className="w-full justify-center gap-3"
      >
        <MicrosoftIcon />
        {submitting ? "Redirigiendo..." : microsoftLabel}
      </Button>
    </>
  );
}
