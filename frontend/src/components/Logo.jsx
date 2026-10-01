import { LOGO_URL, APP_NAME } from "@/config";

export const Logo = ({ showTagline = true, size = "md" }) => {
  const h = size === "lg" ? "h-12" : size === "sm" ? "h-8" : "h-10";
  return (
    <div className="flex items-center gap-2.5" data-testid="app-logo">
      <img src={LOGO_URL} alt={APP_NAME} className={`${h} w-auto object-contain`} />
      {showTagline && (
        <span className="hidden sm:inline-flex items-center rounded-md bg-orange-600 text-white text-xs font-bold px-2 py-1 tracking-wide">
          360 Suite
        </span>
      )}
    </div>
  );
};
