import { LOGO_URL, APP_NAME, APP_TAGLINE } from "@/config";

export const Logo = ({ showTagline = true, size = "md" }) => {
  const h = size === "lg" ? "h-12" : size === "sm" ? "h-8" : "h-10";
  return (
    <div className="flex items-center gap-3" data-testid="app-logo">
      <img src={LOGO_URL} alt="Career Buddha" className={`${h} w-auto object-contain`} />
      {showTagline && (
        <div className="hidden sm:flex flex-col leading-tight">
          <span className="font-heading font-extrabold text-slate-900 text-lg">{APP_NAME}</span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-orange-600">
            {APP_TAGLINE}
          </span>
        </div>
      )}
    </div>
  );
};
