import { Circle, Moon, Square, Star, Triangle, Zap } from "lucide-react";
import type { CircuitModule } from "@/modules/dawn-switchboard/domain/types";

export function ModuleGlyph({
  module,
  size = 30,
}: {
  module: CircuitModule;
  size?: number;
}) {
  const className = `circuit-glyph module-${module.color}`;
  const props = { size, strokeWidth: 2, "aria-hidden": true as const };
  const icon = (() => {
    switch (module.symbol) {
      case "triangle": return <Triangle {...props} />;
      case "circle": return <Circle {...props} />;
      case "star": return <Star {...props} />;
      case "square": return <Square {...props} />;
      case "moon": return <Moon {...props} />;
      case "bolt": return <Zap {...props} />;
    }
  })();
  return <span className={className}>{icon}<span>{module.label}</span></span>;
}
