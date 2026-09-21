import { useRef } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Search box with a magnifier and, once there's something typed, a button to
 * clear it — otherwise you have to select-all-and-delete between searches.
 */
export default function SearchInput({
  value,
  onValueChange,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className={cn("relative", className)}>
      <Search className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 size-4" />
      <Input
        ref={input}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={cn("pl-8", value && "pr-10")}
        onKeyDown={(e) => {
          // Escape clears rather than closing the surrounding dialog.
          if (e.key === "Escape" && value) {
            e.preventDefault();
            e.stopPropagation();
            onValueChange("");
          }
        }}
        {...props}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            onValueChange("");
            input.current?.focus();
          }}
          className="text-muted-foreground hover:text-foreground hover:bg-muted absolute top-1/2 right-1 grid size-8 -translate-y-1/2 place-items-center rounded-md transition-colors"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
